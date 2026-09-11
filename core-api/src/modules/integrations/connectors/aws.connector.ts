import { BadRequestException, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { IntegrationType } from '@/common/enums/enum';
import type { CreateMultipleTargetsDto } from '../../targets/dto/targets.dto';
import { TargetSource, TargetType } from '../../targets/entities/target.entity';
import {
  CloudProviderConnector,
  type AwsSessionCredentials,
  type CloudProviderSyncConfig,
  type ConnectorConfig,
  type ConnectorSyncResult,
} from './connector.abstract';
import {
  getCallerIdentity,
  listOrganizationAccounts,
  resolveAwsCredentials,
  type AwsConnectionMethod,
  type AwsResolvedCredentials,
  type OrganizationAccount,
} from './aws/aws.credentials';
import {
  discoverApiGateway,
  discoverCloudFront,
  discoverEc2,
  discoverElbv2,
  discoverRds,
  discoverRoute53,
  discoverS3,
  isValidDomain,
  isValidPublicIp,
  listEnabledRegions,
  MAX_API_CALLS_PER_SYNC,
  MAX_REGION_CONCURRENCY,
  type Candidate,
  type CandidateType,
  type DiscoveryBudget,
  type DiscoveryInput,
  type DiscoveryResult,
  type DnsRecordType,
  type DnsRecords,
} from './aws/aws.discovery';

/** Lookup page size for the pre-create existence check. */
export const TARGET_LOOKUP_BATCH = 500;
/** Bulk-create page size (the target service rejects the whole batch on one duplicate). */
export const TARGET_CREATE_BATCH = 200;
/** Retries before falling back to one-at-a-time creation. */
export const TARGET_CREATE_MAX_RETRIES = 3;
/** Hard cap on ingests per sync — excess candidates truncate the sync. */
export const MAX_TARGETS_PER_SYNC = 5000;

const DNS_RECORD_TYPES: DnsRecordType[] = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'NS',
  'SOA',
  'TXT',
];

const CONNECTION_METHODS: AwsConnectionMethod[] = [
  'accessKey',
  'assumeRole',
  'crossAccountRole',
  'workloadIdentity',
  'sso',
];

type DiscoveryFn = (input: DiscoveryInput) => Promise<DiscoveryResult>;

/** Services that are global (called once per account, not once per region). */
const GLOBAL_DISCOVERERS: DiscoveryFn[] = [
  discoverRoute53,
  discoverCloudFront,
  discoverS3,
];
/** Services that are region-scoped. */
const REGIONAL_DISCOVERERS: DiscoveryFn[] = [
  discoverEc2,
  discoverElbv2,
  discoverApiGateway,
  discoverRds,
];

/**
 * Result of one AWS asset sync. Extends the shared counts with AWS-specific
 * counters (stashed on the config as `__syncResult`).
 */
export interface AwsSyncResult extends ConnectorSyncResult {
  /** Accounts successfully processed (1 for single-account methods). */
  accounts: number;
  /** Regions enumerated across every processed account. */
  regions: number;
  /** Set when discovery hit its call budget/deadline or candidates were capped. */
  truncated: boolean;
  /** Candidate count per discovery source (`ec2-instance`, `s3`, ...). */
  byKind: Record<string, number>;
}

/**
 * Runtime config assembled by IntegrationSyncService (P4) and injected into the
 * connector. The AWS credential fields mirror `AwsCredentialConfig`.
 */
export interface AwsSyncConfig extends CloudProviderSyncConfig {
  connectionMethod: AwsConnectionMethod;
  region: string;
  regions?: string[];
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  roleArn?: string;
  externalId?: string;
  roleSessionName?: string;
  webIdentityToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accountId?: string;
  roleName?: string;
}

/** Normalized candidate carried through ingestion. */
interface NormalizedCandidate {
  value: string;
  type: CandidateType;
  dnsRecords: DnsRecords;
}

/** Shared mutable state for one sync run. */
interface SyncContext {
  cfg: AwsSyncConfig;
  startedAt: number;
  budget: DiscoveryBudget;
  candidates: Candidate[];
  result: AwsSyncResult;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * AWS cloud-provider connector — credential probe, public-exposure discovery
 * and idempotent Target/Asset ingestion.
 *
 * Read-only against AWS: only List/Describe/Get plus the STS/Organizations
 * credential calls. All SDK access lives in `aws.credentials.ts` /
 * `aws.discovery.ts`; this file only orchestrates.
 */
export class AwsConnector extends CloudProviderConnector {
  private readonly logger = new Logger(AwsConnector.name);

  override readonly category = IntegrationType.CLOUD_PROVIDER;

  override beforeExecute(config: ConnectorConfig): Promise<void> {
    const cfg = config as unknown as AwsSyncConfig;
    if (
      !cfg.connectionMethod ||
      !CONNECTION_METHODS.includes(cfg.connectionMethod)
    ) {
      throw new Error('AWS sync requires a valid connectionMethod');
    }
    if (!this.resolveRegion(cfg)) {
      throw new Error('AWS region is required');
    }

    switch (cfg.connectionMethod) {
      case 'accessKey':
        this.requireField(cfg.accessKeyId, 'accessKey requires accessKeyId');
        this.requireField(
          cfg.secretAccessKey,
          'accessKey requires secretAccessKey',
        );
        break;
      case 'assumeRole':
      case 'crossAccountRole':
        this.requireField(cfg.accessKeyId, 'assumeRole requires accessKeyId');
        this.requireField(
          cfg.secretAccessKey,
          'assumeRole requires secretAccessKey',
        );
        this.requireField(cfg.roleArn, 'assumeRole requires roleArn');
        this.requireField(cfg.externalId, 'assumeRole requires externalId');
        break;
      case 'workloadIdentity':
        this.requireField(cfg.roleArn, 'workloadIdentity requires roleArn');
        this.requireField(
          cfg.webIdentityToken,
          'workloadIdentity requires webIdentityToken',
        );
        break;
      case 'sso':
        this.requireField(cfg.clientId, 'sso requires clientId');
        this.requireField(cfg.clientSecret, 'sso requires clientSecret');
        this.requireField(cfg.refreshToken, 'sso requires refreshToken');
        this.requireField(cfg.accountId, 'sso requires accountId');
        this.requireField(cfg.roleName, 'sso requires roleName');
        break;
    }
    return Promise.resolve();
  }

  override afterExecute(_config: ConnectorConfig): Promise<void> {
    // no-op
    return Promise.resolve();
  }

  async syncAssets(config: ConnectorConfig): Promise<AwsSyncResult> {
    const cfg = config as unknown as AwsSyncConfig;
    const ctx: SyncContext = {
      cfg,
      startedAt: Date.now(),
      budget: { remaining: MAX_API_CALLS_PER_SYNC },
      candidates: [],
      result: {
        targetsCreated: 0,
        assetsUpserted: 0,
        accounts: 0,
        regions: 0,
        truncated: false,
        byKind: {},
      },
    };

    if (cfg.__dryRun) {
      await this.probeDryRun(cfg, ctx.result);
    } else if (cfg.connectionMethod === 'assumeRole') {
      await this.syncAssumeRole(ctx);
    } else {
      await this.syncSingleAccount(ctx);
    }

    this.logger.log(
      `AWS sync finished for integration ${cfg.integrationId}: ${JSON.stringify(ctx.result)}`,
    );
    cfg.__syncResult = ctx.result;
    return ctx.result;
  }

  // ---------------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------------

  /**
   * Base-credential probe for the multi-account path. `ListAccounts` is the
   * base identity check: a base-credential failure rejects here and fails the
   * whole sync (never swallowed). Accounts then run SEQUENTIALLY.
   */
  private async syncAssumeRole(ctx: SyncContext): Promise<void> {
    const { cfg } = ctx;
    const region = this.resolveRegion(cfg);
    const baseCredentials = this.baseCredentials(cfg);

    const accounts = await listOrganizationAccounts(baseCredentials, region);
    for (const account of accounts) {
      if (this.isExhausted(ctx)) {
        ctx.result.truncated = true;
        break;
      }
      await this.processAccount(ctx, account, region);
    }
    await this.ingest(ctx);
  }

  /** Single-account methods: resolve credentials once and probe the identity. */
  private async syncSingleAccount(ctx: SyncContext): Promise<void> {
    const { credentials, region, rotatedRefreshToken } =
      await resolveAwsCredentials(ctx.cfg);
    // Identity probe — a bad credential rejects here and fails the sync.
    await getCallerIdentity(credentials, region);
    await this.persistRotation(ctx, rotatedRefreshToken);

    await this.discoverAccount(ctx, credentials, region);
    ctx.result.accounts += 1;
    await this.ingest(ctx);
  }

  /**
   * Resolve + force the assumed role for one organization account, then
   * discover. ONLY an AccessDenied / AssumeRole failure is caught and the
   * account skipped; anything else propagates and fails the sync.
   */
  private async processAccount(
    ctx: SyncContext,
    account: OrganizationAccount,
    region: string,
  ): Promise<void> {
    try {
      const { credentials, region: accountRegion, rotatedRefreshToken } =
        await resolveAwsCredentials(ctx.cfg, account.accountId);
      // `fromTemporaryCredentials` is lazy: the identity call forces the
      // AssumeRole so a per-account denial surfaces here.
      await getCallerIdentity(credentials, accountRegion);
      await this.persistRotation(ctx, rotatedRefreshToken);

      await this.discoverAccount(
        ctx,
        credentials,
        accountRegion || region,
        account.accountId,
      );
      ctx.result.accounts += 1;
    } catch (error) {
      if (this.isAccountAccessError(error)) {
        this.logger.warn(
          `Skipping AWS account ${account.accountId}: ${errorMessage(error)}`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Dry run — probe credentials/role only, never discover or write. For
   * `assumeRole` the base probe (ListAccounts) runs and the role is assumed in
   * the FIRST ACTIVE account; otherwise a single GetCallerIdentity.
   */
  private async probeDryRun(
    cfg: AwsSyncConfig,
    result: AwsSyncResult,
  ): Promise<void> {
    const region = this.resolveRegion(cfg);
    if (cfg.connectionMethod === 'assumeRole') {
      const accounts = await listOrganizationAccounts(
        this.baseCredentials(cfg),
        region,
      );
      const first = accounts[0];
      if (first) {
        const { credentials, region: assumedRegion } =
          await resolveAwsCredentials(cfg, first.accountId);
        await getCallerIdentity(credentials, assumedRegion);
      }
      result.accounts = accounts.length;
      return;
    }

    const { credentials, region: resolvedRegion } =
      await resolveAwsCredentials(cfg);
    await getCallerIdentity(credentials, resolvedRegion);
    result.accounts = 1;
  }

  /** Persist a rotated SSO refresh token — dry runs MUST NOT write. */
  private async persistRotation(
    ctx: SyncContext,
    rotatedRefreshToken: string | undefined,
  ): Promise<void> {
    if (rotatedRefreshToken && !ctx.cfg.__dryRun) {
      await ctx.cfg.persistConfigPatch?.({ refreshToken: rotatedRefreshToken });
    }
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  private async discoverAccount(
    ctx: SyncContext,
    credentials: AwsResolvedCredentials,
    region: string,
    accountId?: string,
  ): Promise<void> {
    // Discovery is typed for static credentials; the SDK accepts a lazy
    // provider too, which is what assumeRole/workloadIdentity produce.
    const discoveryCredentials = credentials as unknown as AwsSessionCredentials;

    for (const discover of GLOBAL_DISCOVERERS) {
      await this.runDiscovery(
        discover,
        {
          credentials: discoveryCredentials,
          region,
          accountId,
          budget: ctx.budget,
        },
        ctx,
      );
    }

    const regions = await this.resolveRegions(
      discoveryCredentials,
      region,
      ctx,
    );
    ctx.result.regions += regions.length;

    const pool = [...regions];
    const workerCount = Math.min(MAX_REGION_CONCURRENCY, pool.length);
    const workers = Array.from({ length: workerCount }, () =>
      this.regionWorker(pool, discoveryCredentials, accountId, ctx),
    );
    await Promise.all(workers);
  }

  /**
   * Region worker pool — bounded by `MAX_REGION_CONCURRENCY`. Stops claiming
   * new regions once the deadline/call budget is spent (never throws).
   */
  private async regionWorker(
    pool: string[],
    credentials: AwsSessionCredentials,
    accountId: string | undefined,
    ctx: SyncContext,
  ): Promise<void> {
    for (;;) {
      if (this.isExhausted(ctx)) {
        ctx.result.truncated = true;
        return;
      }
      const region = pool.shift();
      if (region === undefined) return;
      for (const discover of REGIONAL_DISCOVERERS) {
        await this.runDiscovery(
          discover,
          { credentials, region, accountId, budget: ctx.budget },
          ctx,
        );
      }
    }
  }

  private async runDiscovery(
    discover: DiscoveryFn,
    input: DiscoveryInput,
    ctx: SyncContext,
  ): Promise<void> {
    if (this.isExhausted(ctx)) {
      ctx.result.truncated = true;
      return;
    }
    const { candidates, truncated } = await discover(input);
    if (truncated) ctx.result.truncated = true;
    for (const candidate of candidates) {
      ctx.candidates.push(candidate);
      ctx.result.byKind[candidate.kind] =
        (ctx.result.byKind[candidate.kind] ?? 0) + 1;
    }
  }

  private async resolveRegions(
    credentials: AwsSessionCredentials,
    region: string,
    ctx: SyncContext,
  ): Promise<string[]> {
    const allowList = (ctx.cfg.regions ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (allowList.length > 0) return allowList;

    const { regions, truncated } = await listEnabledRegions(
      credentials,
      ctx.budget,
      region,
    );
    if (truncated) ctx.result.truncated = true;
    return regions;
  }

  /** Deadline and call-budget gate — budget/deadline breaches never throw. */
  private isExhausted(ctx: SyncContext): boolean {
    if (ctx.budget.remaining <= 0) return true;
    const maxDuration = ctx.cfg.maxSyncDurationMs;
    if (maxDuration === undefined) return false;
    return Date.now() - ctx.startedAt >= maxDuration;
  }

  // ---------------------------------------------------------------------------
  // Ingestion
  // ---------------------------------------------------------------------------

  private async ingest(ctx: SyncContext): Promise<void> {
    const { workspaceId, targetsService, dataAdapterService } = ctx.cfg;

    const normalized = this.normalizeCandidates(ctx.candidates);
    if (normalized.length > MAX_TARGETS_PER_SYNC) {
      ctx.result.truncated = true;
      this.logger.warn(
        `AWS sync candidate count ${normalized.length} exceeds MAX_TARGETS_PER_SYNC (${MAX_TARGETS_PER_SYNC}); truncating`,
      );
      normalized.length = MAX_TARGETS_PER_SYNC;
    }
    if (normalized.length === 0) return;

    const byValue = new Map(normalized.map((candidate) => [candidate.value, candidate]));
    const resolved = new Map<
      string,
      { targetId: string; dnsRecords: DnsRecords }
    >();

    // 1) Pre-lookup every value in bounded chunks; collect the missing.
    const missing: NormalizedCandidate[] = [];
    for (const chunk of chunkArray(normalized, TARGET_LOOKUP_BATCH)) {
      const existing = await targetsService.findByWorkspaceAndValues(
        workspaceId,
        chunk.map((candidate) => candidate.value),
      );
      const existingMap = new Map(existing.map((target) => [target.value, target.id]));
      for (const candidate of chunk) {
        const targetId = existingMap.get(candidate.value);
        if (targetId) {
          resolved.set(candidate.value, {
            targetId,
            dnsRecords: candidate.dnsRecords,
          });
        } else {
          missing.push(candidate);
        }
      }
    }

    // 2) Create the missing values in bounded chunks with race recovery.
    for (const chunk of chunkArray(missing, TARGET_CREATE_BATCH)) {
      await this.createChunkWithRecovery(chunk, byValue, resolved, ctx);
    }

    // 3) Upsert assets for every resolved target (existing + created).
    for (const [value, entry] of resolved) {
      const inserted = await dataAdapterService.upsertAssetsByTargetId(
        entry.targetId,
        [{ value, dnsRecords: entry.dnsRecords }],
        undefined,
        { replaceDnsRecords: true },
      );
      ctx.result.assetsUpserted += inserted;
    }
  }

  /**
   * Create one batch; on a duplicate/invalid-chunk failure re-lookup the
   * chunk, drop values that now exist, and retry up to
   * `TARGET_CREATE_MAX_RETRIES`, then fall back to per-value creation.
   */
  private async createChunkWithRecovery(
    chunk: NormalizedCandidate[],
    byValue: Map<string, NormalizedCandidate>,
    resolved: Map<string, { targetId: string; dnsRecords: DnsRecords }>,
    ctx: SyncContext,
  ): Promise<void> {
    let remaining = chunk;
    for (let attempt = 0; attempt <= TARGET_CREATE_MAX_RETRIES; attempt++) {
      if (remaining.length === 0) return;
      try {
        const created = await this.createBatch(remaining, ctx);
        this.resolveCreated(created, remaining, byValue, resolved);
        return;
      } catch (error) {
        if (!this.isDuplicateTargetError(error)) throw error;
        this.logger.warn(
          `AWS target batch of ${remaining.length} hit a duplicate; re-looking up (retry ${attempt + 1}/${TARGET_CREATE_MAX_RETRIES})`,
        );
        remaining = await this.reLookup(remaining, resolved, ctx);
      }
    }

    // Per-value fallback: a bad value is logged and skipped, never aborts.
    for (const candidate of remaining) {
      await this.ensureTarget(candidate, resolved, ctx);
    }
  }

  private async createBatch(
    chunk: NormalizedCandidate[],
    ctx: SyncContext,
  ): Promise<Array<{ id: string; value: string }>> {
    const dto: CreateMultipleTargetsDto = {
      targets: chunk.map((candidate) => ({
        value: candidate.value,
        type: this.toTargetType(candidate.type),
      })),
    };
    const created = await ctx.cfg.targetsService.createMultipleTargets(
      dto,
      ctx.cfg.workspaceId,
      ctx.cfg.actingUserContext,
      undefined,
      TargetSource.AWS,
    );
    ctx.result.targetsCreated += created.created.length;
    return created.created;
  }

  /** Re-lookup a failed chunk, resolving values that appeared concurrently. */
  private async reLookup(
    remaining: NormalizedCandidate[],
    resolved: Map<string, { targetId: string; dnsRecords: DnsRecords }>,
    ctx: SyncContext,
  ): Promise<NormalizedCandidate[]> {
    const existing = await ctx.cfg.targetsService.findByWorkspaceAndValues(
      ctx.cfg.workspaceId,
      remaining.map((candidate) => candidate.value),
    );
    const existingMap = new Map(existing.map((target) => [target.value, target.id]));
    const stillMissing: NormalizedCandidate[] = [];
    for (const candidate of remaining) {
      const targetId = existingMap.get(candidate.value);
      if (targetId) {
        resolved.set(candidate.value, {
          targetId,
          dnsRecords: candidate.dnsRecords,
        });
      } else {
        stillMissing.push(candidate);
      }
    }
    return stillMissing;
  }

  private resolveCreated(
    created: Array<{ id: string; value: string }>,
    requested: NormalizedCandidate[],
    byValue: Map<string, NormalizedCandidate>,
    resolved: Map<string, { targetId: string; dnsRecords: DnsRecords }>,
  ): void {
    const requestedValues = new Set(requested.map((candidate) => candidate.value));
    for (const target of created) {
      if (!requestedValues.has(target.value)) continue;
      const candidate = byValue.get(target.value);
      if (!candidate) continue;
      resolved.set(target.value, {
        targetId: target.id,
        dnsRecords: candidate.dnsRecords,
      });
    }
  }

  /**
   * Ensure one target exists (lookup → create → duplicate re-lookup). A value
   * that keeps failing is logged `warn` and skipped, never aborting the sync.
   */
  private async ensureTarget(
    candidate: NormalizedCandidate,
    resolved: Map<string, { targetId: string; dnsRecords: DnsRecords }>,
    ctx: SyncContext,
  ): Promise<void> {
    const { workspaceId, targetsService } = ctx.cfg;
    try {
      const existing = await targetsService.findByWorkspaceAndValues(
        workspaceId,
        [candidate.value],
      );
      const found = existing.find((target) => target.value === candidate.value);
      if (found) {
        resolved.set(candidate.value, {
          targetId: found.id,
          dnsRecords: candidate.dnsRecords,
        });
        return;
      }

      const created = await targetsService.createMultipleTargets(
        {
          targets: [
            { value: candidate.value, type: this.toTargetType(candidate.type) },
          ],
        },
        workspaceId,
        ctx.cfg.actingUserContext,
        undefined,
        TargetSource.AWS,
      );
      ctx.result.targetsCreated += created.created.length;
      const target = created.created[0];
      if (target) {
        resolved.set(candidate.value, {
          targetId: target.id,
          dnsRecords: candidate.dnsRecords,
        });
      }
    } catch (error) {
      if (this.isDuplicateTargetError(error)) {
        const reFound = await targetsService.findByWorkspaceAndValues(
          workspaceId,
          [candidate.value],
        );
        const reTarget = reFound.find(
          (target) => target.value === candidate.value,
        );
        if (reTarget) {
          resolved.set(candidate.value, {
            targetId: reTarget.id,
            dnsRecords: candidate.dnsRecords,
          });
          return;
        }
      }
      this.logger.warn(
        `Skipping AWS target ${candidate.value}: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Normalize + dedupe by value: strip trailing dots, drop wildcards and any
   * value that fails the DOMAIN/IP validator. Duplicate values merge their DNS
   * records.
   */
  private normalizeCandidates(candidates: Candidate[]): NormalizedCandidate[] {
    const byValue = new Map<string, NormalizedCandidate>();
    for (const candidate of candidates) {
      let value = candidate.value;
      while (value.endsWith('.')) value = value.slice(0, -1);
      if (value.length === 0 || value.startsWith('*')) continue;

      const valid =
        candidate.type === 'IP'
          ? isValidPublicIp(value)
          : isValidDomain(value);
      if (!valid) continue;

      const existing = byValue.get(value);
      if (existing) {
        this.mergeDnsRecords(existing.dnsRecords, candidate.dnsRecords);
        continue;
      }
      byValue.set(value, {
        value,
        type: candidate.type,
        dnsRecords: this.cloneDnsRecords(candidate.dnsRecords),
      });
    }
    return [...byValue.values()];
  }

  private cloneDnsRecords(records: DnsRecords): DnsRecords {
    return {
      A: [...records.A],
      AAAA: [...records.AAAA],
      CNAME: [...records.CNAME],
      MX: [...records.MX],
      NS: [...records.NS],
      SOA: [...records.SOA],
      TXT: [...records.TXT],
    };
  }

  private mergeDnsRecords(target: DnsRecords, source: DnsRecords): void {
    for (const type of DNS_RECORD_TYPES) {
      for (const value of source[type]) {
        if (!target[type].includes(value)) target[type].push(value);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveRegion(cfg: AwsSyncConfig): string {
    return (cfg.regions?.[0] || cfg.region || '').trim();
  }

  private baseCredentials(cfg: AwsSyncConfig): AwsSessionCredentials {
    if (!cfg.accessKeyId || !cfg.secretAccessKey) {
      throw new Error(
        'assumeRole requires base credentials (accessKeyId + secretAccessKey)',
      );
    }
    return {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      ...(cfg.sessionToken ? { sessionToken: cfg.sessionToken } : {}),
    };
  }

  private requireField(value: string | undefined, message: string): void {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(message);
    }
  }

  private toTargetType(type: CandidateType): TargetType {
    return type === 'IP' ? TargetType.IP : TargetType.DOMAIN;
  }

  /** True when a create-target failure means the batch must be re-looked-up. */
  private isDuplicateTargetError(error: unknown): boolean {
    if (error instanceof BadRequestException) return true;
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string } | undefined;
      return driverError?.code === '23505';
    }
    const code =
      (error as { driverError?: { code?: string } } | undefined)?.driverError
        ?.code ?? (error as { code?: string } | undefined)?.code;
    return code === '23505';
  }

  /** True when a per-account failure is an AccessDenied / AssumeRole denial. */
  private isAccountAccessError(error: unknown): boolean {
    const name = error instanceof Error ? error.name : '';
    const message = errorMessage(error);
    return (
      name === 'AccessDenied' ||
      name === 'AccessDeniedException' ||
      /AccessDenied|not authorized to perform: sts:AssumeRole|AssumeRole/i.test(
        message,
      )
    );
  }
}
