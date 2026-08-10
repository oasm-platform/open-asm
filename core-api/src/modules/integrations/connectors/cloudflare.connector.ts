import { Logger, BadRequestException } from '@nestjs/common';
import { IntegrationType } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import type { DataAdapterService } from '../../data-adapter/data-adapter.service';
import type { TargetType } from '../../targets/entities/target.entity';
import type { TargetsService } from '../../targets/targets.service';
import {
  CloudProviderConnector,
  type ConnectorConfig,
} from './connector.abstract';

/**
 * Cloudflare API v4 — pagination safety caps.
 * Prevents infinite loops against a misbehaving/compromised token.
 */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const ZONES_PAGE_SIZE = 50; // API max per page
const DNS_RECORDS_PAGE_SIZE = 5000; // API max per page
const MAX_ZONES_PAGES = 2000; // max 2000 zone pages before we bail
const MAX_DNS_RECORDS_PAGES = 1000; // max 1000 dns_records pages per zone
const MAX_REQUEST_ATTEMPTS = 3; // 429 retries per request
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_AFTER_SECONDS = 60;

/**
 * The 7 record types the platform stores — same shape as the built-in
 * subfinder parser (tools/tools-provider/built-in-tools.ts). Any other
 * record type returned by Cloudflare is ignored.
 */
const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT'] as const;

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];
export type DnsRecords = Record<DnsRecordType, string[]>;

/**
 * Result of one Cloudflare asset sync.
 */
export interface SyncResult {
  zones: number;
  records: number;
  wildcardZones: number;
  targetsCreated: number;
  assetsUpserted: number;
}

/**
 * Raised for any Cloudflare API-level failure (HTTP error, page cap, 429
 * exhaustion). Callers can distinguish sync failures from programming errors.
 */
export class CloudflareSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudflareSyncError';
  }
}

/** Standard Cloudflare v4 envelope. */
interface CloudflareApiPayload<T> {
  success: boolean;
  errors: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: {
    count: number;
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

/**
 * Runtime config assembled by IntegrationSyncService (P4) and injected into
 * the connector. Services are dependency-injected at runtime — the connector
 * only knows their surface via `import type`, so there is no runtime import
 * of the service modules.
 */
export interface CloudflareSyncConfig extends ConnectorConfig {
  apiToken: string;
  workspaceId: string;
  integrationId: string;
  /** Optional filter for the zones list endpoint (e.g. { status: 'active' }). */
  zoneFilter?: { status?: string };
  /** Test mode — fetch only, never write to the DB. */
  __dryRun?: boolean;
  /**
   * Stashed by syncAssets before returning so the caller (IntegrationSyncService)
   * can read the counts back without re-parsing the connector result message.
   */
  __syncResult?: SyncResult;
  targetsService: Pick<
    TargetsService,
    'findByWorkspaceAndValues' | 'createMultipleTargets'
  >;
  dataAdapterService: Pick<DataAdapterService, 'upsertAssetsByTargetId'>;
  actingUserContext: UserContextPayload;
}

/**
 * Cloudflare integration connector — fetches zones + DNS records and ingests
 * them as targets/assets.
 *
 * - Zone apex (zone.name) → Target (DOMAIN); primary asset refresh happens
 *   inside `dataAdapterService.upsertAssetsByTargetId`.
 * - Every other hostname → Asset under that target.
 * - Record names come back from the Cloudflare API in punycode — kept as-is,
 *   matching the values stored in the repo.
 * - Wildcard records (`*.example.com`) are counted but never materialized.
 */
export class CloudflareConnector extends CloudProviderConnector {
  private readonly logger = new Logger(CloudflareConnector.name);

  override readonly category = IntegrationType.CLOUD_PROVIDER;

  override beforeExecute(config: ConnectorConfig): Promise<void> {
    const { apiToken } = config as unknown as CloudflareSyncConfig;
    if (!apiToken) {
      throw new Error('Cloudflare sync requires apiToken in config');
    }
    return Promise.resolve();
  }

  override async afterExecute(_config: ConnectorConfig): Promise<void> {
    // no-op
  }

  async syncAssets(config: ConnectorConfig): Promise<SyncResult> {
    const cfg = config as unknown as CloudflareSyncConfig;
    const {
      apiToken,
      workspaceId,
      integrationId,
      zoneFilter,
      __dryRun,
      targetsService,
      dataAdapterService,
      actingUserContext,
    } = cfg;

    const status = zoneFilter?.status ?? 'active';
    const zones = await this.fetchAllZones(apiToken, status);

    const result: SyncResult = {
      zones: zones.length,
      records: 0,
      wildcardZones: 0,
      targetsCreated: 0,
      assetsUpserted: 0,
    };

    // Dedupe key `${targetId}:${value}` across the whole sync, so a hostname
    // seen under the same target (e.g. two zones) is only upserted once.
    const seenAssets = new Set<string>();

    for (const zone of zones) {
      // Defensive: the API was asked for `status=active`, but skip anything
      // that came back non-active anyway.
      if (zone.status !== 'active') continue;

      const records = await this.fetchZoneDnsRecords(apiToken, zone.id);
      result.records += records.length;

      const { byHostname, wildcardCount } = this.normalizeRecords(records);
      result.wildcardZones += wildcardCount;

      if (__dryRun) continue;

      // a) Apex hostname → target (lookup or create with race guard).
      const apex = zone.name;
      const targetId = await this.ensureTarget(
        apex,
        workspaceId,
        targetsService,
        actingUserContext,
        result,
      );

      // b) Every hostname of this zone (apex included, so the primary asset
      //    refresh inside upsertAssetsByTargetId can pick up apex records;
      //    orIgnore prevents a duplicate apex row) → pending assets.
      const pending: Array<{ value: string; dnsRecords: DnsRecords }> = [];
      for (const [hostname, dnsRecords] of byHostname) {
        const key = `${targetId}:${hostname}`;
        if (seenAssets.has(key)) continue;
        seenAssets.add(key);
        pending.push({ value: hostname, dnsRecords });
      }

      // c) Upsert once per target. isEnabled is left to the data-adapter
      //    default (workspace config isAutoEnableAssetAfterDiscovered).
      if (pending.length === 0) continue;
      const inserted = await dataAdapterService.upsertAssetsByTargetId(
        targetId,
        pending,
      );
      result.assetsUpserted += inserted;
    }

    this.logger.log(
      `Cloudflare sync finished for integration ${integrationId}: ${JSON.stringify(result)}`,
    );
    // Stash the counts on the config so runSync can return them to the API
    // without coupling to the connector factory's result message.
    cfg.__syncResult = result;
    return result;
  }

  /**
   * Ensure a Target exists for the zone apex. Returns the target id.
   * On a duplicate-creation race (another sync created the same target
   * between lookup and insert) the "Target already exists" BadRequestException
   * is caught and the target is re-looked-up.
   */
  private async ensureTarget(
    apex: string,
    workspaceId: string,
    targetsService: CloudflareSyncConfig['targetsService'],
    actingUserContext: UserContextPayload,
    result: SyncResult,
  ): Promise<string> {
    const existing = await targetsService.findByWorkspaceAndValues(
      workspaceId,
      [apex],
    );
    const existingTarget = existing.find((t) => t.value === apex);
    if (existingTarget) return existingTarget.id;

    try {
      const created = await targetsService.createMultipleTargets(
        { targets: [{ value: apex, type: 'DOMAIN' as TargetType }] },
        workspaceId,
        actingUserContext,
      );
      result.targetsCreated++;
      return created.created[0].id;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message.startsWith('Target already exists')
      ) {
        const reFound = await targetsService.findByWorkspaceAndValues(
          workspaceId,
          [apex],
        );
        const reTarget = reFound.find((t) => t.value === apex);
        if (reTarget) return reTarget.id;
      }
      throw error;
    }
  }

  /**
   * Group records per hostname into the canonical 7-key dnsRecords shape.
   * Contents are deduped per type; record types outside the 7 supported keys
   * are ignored; wildcard names are counted and dropped.
   */
  private normalizeRecords(
    records: CloudflareDnsRecord[],
  ): { byHostname: Map<string, DnsRecords>; wildcardCount: number } {
    const byHostname = new Map<string, DnsRecords>();
    let wildcardCount = 0;

    for (const record of records) {
      if (!(DNS_RECORD_TYPES as readonly string[]).includes(record.type)) {
        continue;
      }
      // Wildcard records are not materialized as assets — only counted.
      if (record.name.startsWith('*')) {
        wildcardCount++;
        continue;
      }

      // Names come back in punycode — keep verbatim (repo stores punycode too).
      let entry = byHostname.get(record.name);
      if (!entry) {
        entry = { A: [], AAAA: [], CNAME: [], MX: [], NS: [], SOA: [], TXT: [] };
        byHostname.set(record.name, entry);
      }
      const type = record.type as DnsRecordType;
      if (!entry[type].includes(record.content)) {
        entry[type].push(record.content);
      }
    }

    return { byHostname, wildcardCount };
  }

  private async fetchAllZones(
    apiToken: string,
    status: string,
  ): Promise<CloudflareZone[]> {
    const zones: CloudflareZone[] = [];
    let page = 1;
    for (;;) {
      const payload = await this.cfFetch<CloudflareZone[]>(
        apiToken,
        `/zones?per_page=${ZONES_PAGE_SIZE}&status=${status}&page=${page}`,
      );
      zones.push(...payload.result);
      const totalPages = payload.result_info?.total_pages ?? 1;
      if (page >= totalPages) break;
      page++;
      if (page > MAX_ZONES_PAGES) {
        throw new CloudflareSyncError('zone page cap exceeded');
      }
    }
    return zones;
  }

  private async fetchZoneDnsRecords(
    apiToken: string,
    zoneId: string,
  ): Promise<CloudflareDnsRecord[]> {
    const records: CloudflareDnsRecord[] = [];
    let page = 1;
    for (;;) {
      const payload = await this.cfFetch<CloudflareDnsRecord[]>(
        apiToken,
        `/zones/${zoneId}/dns_records?per_page=${DNS_RECORDS_PAGE_SIZE}&page=${page}`,
      );
      records.push(...payload.result);
      const totalPages = payload.result_info?.total_pages ?? 1;
      if (page >= totalPages) break;
      page++;
      if (page > MAX_DNS_RECORDS_PAGES) {
        throw new CloudflareSyncError('dns_records page cap exceeded');
      }
    }
    return records;
  }

  /**
   * Single Cloudflare v4 request with 429 retry-after handling.
   * Up to MAX_REQUEST_ATTEMPTS attempts, then throws CloudflareSyncError.
   */
  private async cfFetch<T>(
    apiToken: string,
    path: string,
  ): Promise<CloudflareApiPayload<T>> {
    const url = `${CLOUDFLARE_API_BASE}${path}`;
    let attempts = 0;

    for (;;) {
      attempts++;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
      } catch (error) {
        throw new CloudflareSyncError(
          `Cloudflare API request failed for ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (response.status === 429) {
        if (attempts >= MAX_REQUEST_ATTEMPTS) {
          throw new CloudflareSyncError(
            `Cloudflare API rate limited (429) after ${attempts} attempts for ${path}`,
          );
        }
        const retryAfterSeconds = this.parseRetryAfter(response);
        this.logger.warn(
          `Cloudflare API 429 for ${path}, retrying in ${retryAfterSeconds}s (attempt ${attempts}/${MAX_REQUEST_ATTEMPTS})`,
        );
        await this.sleep(retryAfterSeconds * 1000);
        continue;
      }

      if (!response.ok) {
        const bodySnippet = (await response.text()).slice(0, 500);
        throw new CloudflareSyncError(
          `Cloudflare API error ${response.status} for ${path}: ${bodySnippet}`,
        );
      }

      const payload = (await response.json()) as CloudflareApiPayload<T>;
      if (payload.success === false) {
        const detail =
          payload.errors
            ?.map((e) => e.message)
            .filter((m): m is string => Boolean(m))
            .join('; ') || 'unknown error';
        throw new CloudflareSyncError(
          `Cloudflare API returned success=false for ${path}: ${detail}`,
        );
      }
      return payload;
    }
  }

  /** Parse the `retry-after` header (seconds), clamped to a sane range. */
  private parseRetryAfter(response: Response): number {
    const raw = response.headers.get('retry-after');
    const seconds = raw ? Number.parseInt(raw, 10) : Number.NaN;
    const value =
      Number.isFinite(seconds) && seconds > 0
        ? seconds
        : DEFAULT_RETRY_AFTER_SECONDS;
    return Math.min(value, MAX_RETRY_AFTER_SECONDS);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
