import { ScreenshotPayload } from '@/common/interfaces/app.interface';
import { JobDataResultType } from '@/common/types/app.types';
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as crypto from 'crypto';
import { isIP } from 'node:net';
import { DataSource, InsertResult } from 'typeorm';
import { Severity, ToolCategory } from '../../common/enums/enum';
import { AssetService } from '../assets/entities/asset-services.entity';
import { Asset } from '../assets/entities/assets.entity';
import { DiscoveredUrl } from '../assets/entities/discovered-url.entity';
import { DnsRecord } from '../assets/entities/dns-record.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { HttpResponseTechnology } from '../assets/entities/http-response-technology.entity';
import { HttpStatusCode } from '../assets/entities/http-status-code.entity';
import { IpObservation } from '../assets/entities/ip-observation.entity';
import { Port } from '../assets/entities/ports.entity';
import { TlsCertificate } from '../assets/entities/tls-certificate.entity';
import { IssuesService } from '../issues/issues.service';
import { EVENT_CATALOG } from '../connectors/event';
import { EventBridgeService } from '../event-bridge/event-bridge.service';
import { StorageService } from '../storage/storage.service';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataAdapterInput } from './data-adapter.interface';

/**
 * Convert a protobuf Timestamp ({seconds, nanos}) to a Date.
 * Also handles Date instances, ISO strings, and epoch numbers.
 */
function normalizeTimestamp(val: unknown): Date | undefined {
  if (val === null || val === undefined) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof val === 'object' && 'seconds' in val) {
    const sec = Number((val as { seconds: string | number }).seconds);
    return isNaN(sec) ? undefined : new Date(sec * 1000);
  }
  return undefined;
}

/**
 * Merge the DNS records of the primary asset with freshly discovered apex
 * records. Values are unioned per record type key (A, AAAA, CNAME, MX, NS,
 * SOA, TXT) and deduped; keys present on only one side are kept. Null or
 * undefined sides are treated as empty so a re-sync never wipes previously
 * discovered records.
 */
export function mergeDnsRecords(
  current: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]> | null | undefined,
): Record<string, string[]> {
  const currentSafe = current ?? {};
  const incomingSafe = incoming ?? {};
  const merged: Record<string, string[]> = {};
  const keys = new Set<string>([
    ...Object.keys(currentSafe),
    ...Object.keys(incomingSafe),
  ]);
  for (const key of keys) {
    merged[key] = [
      ...new Set([...(currentSafe[key] ?? []), ...(incomingSafe[key] ?? [])]),
    ];
  }
  return merged;
}

/**
 * Scanner-derived vulnerability columns refreshed from the incoming finding on
 * a fingerprint conflict. `firstDetectedDate`, `isArchived` and the `analyze*`
 * fields are deliberately excluded so a re-scan cannot reset provenance,
 * triage, or AI-analysis state.
 */
const RESCAN_OVERWRITE_COLUMNS = [
  'updatedAt',
  'lastSeenDate',
  'name',
  'description',
  'synopsis',
  'severity',
  'tags',
  'references',
  'authors',
  'affectedUrl',
  'ipAddress',
  'host',
  'ports',
  'cvssMetric',
  'cvssScore',
  'epssScore',
  'vprScore',
  'cveId',
  'bidId',
  'cweId',
  'ceaId',
  'iava',
  'cveUrl',
  'cweUrl',
  'solution',
  'extractorName',
  'extractedResults',
  'publicationDate',
  'modificationDate',
  'filePath',
] as const;

/**
 * Columns an incoming finding may omit. `updatedAt`/`lastSeenDate` are always
 * stamped by the ingest, so only the optionals need preserving.
 */
const RESCAN_PRESERVE_COLUMNS = RESCAN_OVERWRITE_COLUMNS.filter(
  (column) => column !== 'updatedAt' && column !== 'lastSeenDate',
);

/**
 * Rows per INSERT statement for the vulnerability upsert. Postgres' extended
 * query protocol caps a prepared statement at 65535 parameters; a row here is
 * ~45 columns, so a bulk insert of a couple thousand findings overflows the
 * cap and the whole batch is rejected by the driver ("bind message has N
 * parameter formats but 0 parameters"). 500 rows ≈ 22.5k parameters keeps a
 * comfortable margin under the cap while limiting round-trips.
 */
export const VULNERABILITY_INSERT_CHUNK_SIZE = 500;

/**
 * Split a httpx tech string on the FIRST ':' only — versions may contain
 * further colons. Returns [name, version|null]; empty input → null.
 */
export function splitTechString(
  raw: string,
): { name: string; version: string | null } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(':');
  if (idx < 0) return { name: trimmed, version: null };
  const name = trimmed.slice(0, idx).trim();
  if (!name) return null;
  const version = trimmed.slice(idx + 1).trim() || null;
  return { name, version };
}

/**
 * Flatten the httpx `tls` jsonb payload into a TlsCertificate row. Unknown or
 * malformed date strings become null (never throw — ingest must not fail on
 * dirty scanner data).
 */
export function toTlsCertificateRow(
  tls: Record<string, unknown> | null | undefined,
  keys: { httpResponseId: string; assetServiceId?: string; jobHistoryId?: string },
): Record<string, unknown> | null {
  if (!tls || typeof tls !== 'object') return null;
  const str = (key: string): string | undefined => {
    const v = tls[key];
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const bool = (key: string): boolean => tls[key] === true;
  const fp =
    tls.fingerprint_hash && typeof tls.fingerprint_hash === 'object'
      ? (tls.fingerprint_hash as Record<string, unknown>)
      : {};
  const fpStr = (key: string): string | undefined => {
    const v = fp[key];
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const arr = (key: string): string[] | undefined => {
    const v = tls[key];
    return Array.isArray(v) && v.every((e) => typeof e === 'string')
      ? (v as string[])
      : undefined;
  };
  return {
    ...keys,
    host: str('host'),
    port: str('port'),
    probeStatus: bool('probe_status'),
    tlsVersion: str('tls_version'),
    cipher: str('cipher'),
    notBefore: normalizeTimestamp(tls.not_before),
    notAfter: normalizeTimestamp(tls.not_after),
    subjectDn: str('subject_dn'),
    subjectCn: str('subject_cn'),
    subjectAn: arr('subject_an'),
    serial: str('serial'),
    issuerDn: str('issuer_dn'),
    issuerCn: str('issuer_cn'),
    issuerOrg: arr('issuer_org'),
    fingerprintMd5: fpStr('md5'),
    fingerprintSha1: fpStr('sha1'),
    fingerprintSha256: fpStr('sha256'),
    wildcardCertificate: bool('wildcard_certificate'),
    tlsConnection: str('tls_connection'),
    sni: str('sni'),
  };
}

/** Columns that live in child facet tables, never in `http_responses`. */
const HTTP_RESPONSE_FACET_KEYS = [
  'tls',
  'tech',
  'a',
  'resolvers',
  'chain_status_codes',
] as const;

@Injectable()
export class DataAdapterService {
  private readonly logger = new Logger(DataAdapterService.name);

  constructor(
    private readonly dataSource: DataSource,
    private workspaceService: WorkspacesService,
    private issuesService: IssuesService,
    private storageService: StorageService,
    private readonly eventBridge: EventBridgeService,
  ) {}

  public async validateData<T extends object>(
    data: object | object[],
    cls: new () => T,
  ): Promise<boolean> {
    const arr = Array.isArray(data) ? data : [data];

    for (const item of arr) {
      const instance = plainToInstance(cls, item);
      const errors = await validate(instance as object);
      if (errors.length > 0) {
        return false;
      }
    }

    return true;
  }

  public async subdomains({
    data,
    job,
  }: DataAdapterInput<Asset[]>): Promise<void> {
    await this.upsertAssetsByTargetId(
      job.asset.target.id,
      data as Array<{ value: string; dnsRecords: Record<string, string[]> }>,
    );
  }

  /**
   * Upsert a batch of discovered assets under one target.
   *
 * - Deduplicates assets in memory by `value`.
 * - Refreshes the target's primary asset: sets `isPrimary: true` and merges
 *   the records for the apex value (the entry in `assets` whose value matches
 *   the primary asset's value) into its existing `dnsRecords` — never
 *   replaces, so discovered records survive re-syncs; skipped entirely when
 *   the apex is absent from the batch (no NULL clobber).
 * - Batch-inserts the assets with `.orIgnore()` so re-runs are idempotent
 *   (MERGE semantics for `dnsRecords` come from the primary refresh;
 *   subdomain rows are only ever created).
   *
   * @param targetId - Target the assets belong to.
   * @param assets - Discovered assets ({ value, dnsRecords }). Should include
   *   the apex entry so the primary asset refresh can pick up apex records.
   * @param isEnabled - Insert flag; defaults to the workspace config
   *   `isAutoEnableAssetAfterDiscovered`.
   * @param opts - replaceDnsRecords: true makes the primary refresh REPLACE
   *   (not merge) apex dnsRecords and switches the insert from `.orIgnore()`
   *   to `.orUpdate(['dnsRecords'], ['value', 'targetId'])`, so re-syncs
   *   remove records that disappeared upstream. Never overwrites isEnabled.
   *   Omitted → merge + orIgnore (scanner subdomains() path unchanged).
   * @returns The number of asset rows actually inserted.
   */
  public async upsertAssetsByTargetId(
    targetId: string,
    assets: Array<{ value: string; dnsRecords: Record<string, string[]> }>,
    isEnabled?: boolean,
    opts?: { replaceDnsRecords?: boolean },
  ): Promise<number> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Deduplicate data based on value
      const uniqueData = Array.from(
        new Map(assets.map((asset) => [asset.value, asset])).values(),
      );

      // Locate the primary asset so its value can select the apex dnsRecords
      // from the batch (same semantics as the old `job.asset.value` lookup).
      const primaryAsset = await queryRunner.manager
        .createQueryBuilder()
        .select('asset.id', 'id')
        .addSelect('asset.value', 'value')
        .addSelect('asset.dnsRecords', 'dnsRecords')
        .from(Asset, 'asset')
        .where('asset.targetId = :targetId', { targetId })
        .andWhere('asset.isPrimary = true')
        .getRawOne<{
          id: string;
          value: string;
          dnsRecords?: Record<string, string[]> | null;
        }>();

      // Refresh the primary asset with the apex records — only when the apex
      // is present in the batch. Merge (not replace) so discovered records
      // survive re-syncs; skipping when the apex is absent avoids clobbering
      // dnsRecords with NULL on re-runs (the isPrimary refresh is only
      // relevant on first creation anyway). With replaceDnsRecords the apex
      // records REPLACE the existing set (stale records disappear).
      if (primaryAsset) {
        const apexRecords = uniqueData.find(
          (asset) => asset.value === primaryAsset.value,
        );
        if (apexRecords) {
          await queryRunner.manager
            .createQueryBuilder()
            .update(Asset)
            .where({ id: primaryAsset.id })
            .set({
              isPrimary: true,
              dnsRecords: opts?.replaceDnsRecords
                ? apexRecords.dnsRecords
                : mergeDnsRecords(
                    primaryAsset.dnsRecords,
                    apexRecords.dnsRecords,
                  ),
            })
            .execute();
        }
      }

      const workspaceId = await this.workspaceService.getWorkspaceIdByTargetId(
        targetId,
      );
      const workspaceConfigs =
        await this.workspaceService.getWorkspaceConfigValue(workspaceId!);

      // Insert Assets. Default: orIgnore (re-runs are idempotent; subdomain
      // rows are only ever created). replaceDnsRecords: orUpdate on
      // (value, targetId) so existing rows' dnsRecords are refreshed while
      // isEnabled (and every other column) stays untouched.
      const insertQb = queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Asset)
        .values(
          uniqueData.map((asset) => ({
            value: asset.value,
            dnsRecords: asset.dnsRecords,
            target: { id: targetId },
            isEnabled:
              isEnabled ?? workspaceConfigs.isAutoEnableAssetAfterDiscovered,
          })),
        );
      const insertResult = await (opts?.replaceDnsRecords
        ? insertQb.orUpdate(['dnsRecords'], ['value', 'targetId'])
        : insertQb.orIgnore()
      ).execute();

      // Mirror freshly discovered DNS into the normalized facet tables so new
      // rows are queryable immediately (the migration backfill covers old rows
      // only). `assets.dnsRecords` json stays the cache; DnsRecord rows are
      // the source of truth for facet queries.
      if (insertResult.identifiers?.length) {
        const assetIdsByValue = new Map<string, string>();
        const insertedIds = insertResult.identifiers as Array<{
          id?: string;
        }>;
        uniqueData.forEach((asset, i) => {
          const id = insertedIds[i]?.id;
          if (id) assetIdsByValue.set(asset.value, id);
        });
        const dnsRows: Array<{
          assetId: string;
          recordType: string;
          value: string;
        }> = [];
        const dnsIpRows: Array<{
          assetId: string;
          ip: string;
          source: 'dns_a' | 'dns_aaaa';
        }> = [];
        for (const asset of uniqueData) {
          const assetId = assetIdsByValue.get(asset.value);
          if (!assetId || !asset.dnsRecords) continue;
          for (const [rawType, values] of Object.entries(asset.dnsRecords)) {
            if (!Array.isArray(values)) continue;
            const recordType = rawType.toUpperCase();
            for (const v of values) {
              if (typeof v !== 'string' || v === '') continue;
              dnsRows.push({ assetId, recordType, value: v });
              if (recordType === 'A' && isIP(v) === 4) {
                dnsIpRows.push({ assetId, ip: v, source: 'dns_a' });
              } else if (recordType === 'AAAA' && isIP(v) === 6) {
                dnsIpRows.push({ assetId, ip: v, source: 'dns_aaaa' });
              }
            }
          }
        }
        if (dnsRows.length > 0) {
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(DnsRecord)
            .values(dnsRows)
            .orIgnore()
            .execute();
        }
        if (dnsIpRows.length > 0) {
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(IpObservation)
            .values(dnsIpRows)
            .orIgnore()
            .execute();
        }
      }

      await queryRunner.commitTransaction();
      return insertResult.identifiers?.length ?? 0;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * HTTP probe ingest: one slim `http_responses` row plus fan-out into the
   * facet child tables (tls_certificates, http_response_technologies,
   * ip_observations, http_status_codes) inside the same transaction.
   * The gRPC/REST payload shape is unchanged — the split happens here.
   */
  public async httpResponses({
    data,
    job,
  }: DataAdapterInput<HttpResponse>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const assetServiceId = job.assetService?.id;
      const jobHistoryId = job.jobHistory.id;

      if (data.failed && job.assetServiceId) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(AssetService)
          .set({ isErrorPage: true })
          .where({ id: job.assetServiceId })
          .execute();
      }

      const { id: _ignored, ...rest } = data as unknown as Record<
        string,
        string | number | boolean | object | null | undefined
      >;
      void _ignored;
      for (const key of HTTP_RESPONSE_FACET_KEYS) delete rest[key];
      const saved = await queryRunner.manager.getRepository(HttpResponse).save({
        ...rest,
        assetServiceId,
        jobHistoryId,
      });
      const httpResponseId = saved.id;

      const tasks: Promise<unknown>[] = [];

      const tlsRow = toTlsCertificateRow(
        data.tls as Record<string, unknown> | null | undefined,
        { httpResponseId, assetServiceId, jobHistoryId },
      );
      if (tlsRow) {
        tasks.push(
          queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(TlsCertificate)
            .values(tlsRow)
            .orUpdate({
              conflict_target: ['httpResponseId'],
              overwrite: Object.keys(tlsRow).filter(
                (k) => k !== 'httpResponseId',
              ),
            })
            .execute(),
        );
      }

      const techRows = Array.isArray(data.tech)
        ? data.tech
            .map((t) =>
              typeof t === 'string'
                ? splitTechString(t)
                : null,
            )
            .filter(
              (t): t is { name: string; version: string | null } => t !== null,
            )
            .map((t) => ({
              name: t.name,
              version: t.version ?? undefined,
              httpResponseId,
              assetServiceId,
            }))
        : [];
      if (techRows.length > 0) {
        tasks.push(
          queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(HttpResponseTechnology)
            .values(techRows)
            .orIgnore()
            .execute(),
        );
      }

      const ipRows: Array<{
        ip: string;
        source: 'httpx_a' | 'resolver';
        httpResponseId: string;
        assetServiceId?: string;
        jobHistoryId: string;
      }> = [];
      for (const ip of Array.isArray(data.a) ? data.a : []) {
        if (typeof ip === 'string' && ip !== '' && isIP(ip) !== 0) {
          ipRows.push({
            ip,
            source: 'httpx_a',
            httpResponseId,
            assetServiceId,
            jobHistoryId,
          });
        }
      }
      for (const ip of Array.isArray(data.resolvers) ? data.resolvers : []) {
        if (typeof ip === 'string' && ip !== '' && isIP(ip) !== 0) {
          ipRows.push({
            ip,
            source: 'resolver',
            httpResponseId,
            assetServiceId,
            jobHistoryId,
          });
        }
      }
      if (ipRows.length > 0) {
        tasks.push(
          queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(IpObservation)
            .values(ipRows)
            .orIgnore()
            .execute(),
        );
      }

      const statusRows: Array<{
        statusCode: number;
        isPrimary: boolean;
        chainIndex?: number;
        httpResponseId: string;
        assetServiceId?: string;
      }> = [];
      if (
        typeof data.status_code === 'number' &&
        Number.isInteger(data.status_code)
      ) {
        statusRows.push({
          statusCode: data.status_code,
          isPrimary: true,
          chainIndex: undefined,
          httpResponseId,
          assetServiceId,
        });
      }
      const chain = Array.isArray(data.chain_status_codes)
        ? data.chain_status_codes
        : [];
      chain.forEach((code, i) => {
        const n = typeof code === 'number' ? code : parseInt(String(code), 10);
        if (Number.isInteger(n)) {
          statusRows.push({
            statusCode: n,
            isPrimary: false,
            chainIndex: i,
            httpResponseId,
            assetServiceId,
          });
        }
      });
      if (statusRows.length > 0) {
        tasks.push(
          queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(HttpStatusCode)
            .values(statusRows)
            .orIgnore()
            .execute(),
        );
      }

      await Promise.all(tasks);
      await queryRunner.commitTransaction();

      return;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * URL discovery data normalization: one row per unique URL, attached to the
   * job's AssetService and JobHistory. Deduped in-app (Set) and DB-level
   * (unique constraint + orIgnore) so worker retries / workflow re-runs are
   * idempotent.
   */
  public async urlDiscovery({
    data,
    job,
  }: DataAdapterInput<DiscoveredUrl[]>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (!job.assetServiceId) {
        this.logger.warn(
          `urlDiscovery: job ${job.id} has no assetServiceId — skipping`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      const MAX_URL_LENGTH = 2048;
      const raw = (data ?? [])
        .map((d) => d?.url?.trim())
        .filter((u): u is string => !!u);
      const tooLong = raw.filter((u) => u.length > MAX_URL_LENGTH);
      if (tooLong.length > 0) {
        this.logger.warn(
          `urlDiscovery: dropped ${tooLong.length} url(s) longer than ${MAX_URL_LENGTH} chars for job ${job.id}`,
        );
      }
      const urls = [...new Set(raw.filter((u) => u.length <= MAX_URL_LENGTH))];

      if (urls.length > 0) {
        // A single INSERT would exceed PostgreSQL's 65535 bind-parameter cap
        // (3 params per row → ~21k rows), so insert in bounded chunks inside
        // the same transaction.
        const INSERT_BATCH_SIZE = 5000;
        for (let i = 0; i < urls.length; i += INSERT_BATCH_SIZE) {
          const batch = urls.slice(i, i + INSERT_BATCH_SIZE);
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(DiscoveredUrl)
            .values(
              batch.map((url) => ({
                url,
                assetServiceId: job.assetServiceId,
                jobHistoryId: job.jobHistory.id,
              })),
            )
            .orIgnore()
            .execute();
        }
      }

      await queryRunner.commitTransaction();
      return;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   *
   * @param param0
   * @returns
   */
  public async portsScanner({
    data,
    job,
  }: DataAdapterInput<number[]>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Filter out NaN values from the port array
    // Deduplicate ports
    const uniquePorts = [...new Set(data.filter((port) => !isNaN(port)))];

    try {
      // Insert ports data
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(Port)
        .values({
          ports: uniquePorts,
          assetId: job.asset.id,
          jobHistoryId: job.jobHistory.id,
        })
        .execute();

      // Insert asset services data
      if (uniquePorts && uniquePorts.length > 0) {
        const assetServices = uniquePorts.map((port) => ({
          value: `${job.asset.value}:${port}`,
          port: port,
          assetId: job.asset.id,
        }));

        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(AssetService)
          .values(assetServices)
          .orUpdate({
            conflict_target: ['assetId', 'port'],
            overwrite: ['value'],
          })
          .execute();
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return;
  }

  /**
   * Vulnerabilities data normalization
   * @param param0
   * @returns
   */
  public async vulnerabilities({
    data,
    job,
  }: DataAdapterInput<Vulnerability[]>): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (data.length === 0) {
        return;
      }

      const now = new Date();
      const values = data.map((vuln) => {
        const stringHash = `${vuln.name}-${job.asset.id}-${job.tool.id}`;
        const fingerprint = crypto
          .createHash('md5')
          .update(stringHash)
          .digest('hex');
        const vulnValues = { ...vuln } as unknown as Record<string, string | number | boolean | object | null>;
        delete vulnValues.id;
        return {
          ...vulnValues,
          severity:
            typeof vulnValues.severity === 'string'
              ? (vulnValues.severity.toLowerCase() as Severity)
              : Severity.INFO,
          fingerprint,
          assetId: job.asset.id,
          toolId: job.tool.id,
          asset: { id: job.asset.id },
          jobHistory: { id: job.jobHistory.id },
          tool: { id: job.tool.id },
          publicationDate: normalizeTimestamp(vulnValues.publicationDate),
          modificationDate: normalizeTimestamp(vulnValues.modificationDate),
          firstDetectedDate: now,
          lastSeenDate: now,
        };
      });

      // Deduplicate based on fingerprint
      const uniqueValues = Array.from(
        new Map(values.map((v) => [v.fingerprint, v])).values(),
      );

      // Pre-check: load the stored rows for the fingerprints about to be
      // upserted, both to avoid notifications for updated vulns and to reuse
      // their enrichment values below.
      const existingRows: Array<Record<string, unknown>> = await manager
        .createQueryBuilder()
        .select('v.fingerprint', 'fingerprint')
        .addSelect(
          RESCAN_PRESERVE_COLUMNS.map((column) => `v.${column} AS ${column}`),
        )
        .from(Vulnerability, 'v')
        .where('v.fingerprint IN (:...fingerprints)', {
          fingerprints: uniqueValues.map((v) => v.fingerprint),
        })
        .getRawMany();

      const existingByFingerprint = new Map<string, Record<string, unknown>>(
        existingRows.map((row) => [row.fingerprint as string, row]),
      );

      // A finding that omits a field inserts NULL, and EXCLUDED would then
      // erase the stored value on conflict — keep the old value instead.
      for (const value of uniqueValues) {
        const previous = existingByFingerprint.get(value.fingerprint);
        if (!previous) continue;
        const incoming = value as unknown as Record<string, unknown>;
        for (const column of RESCAN_PRESERVE_COLUMNS) {
          if (incoming[column] === undefined || incoming[column] === null) {
            incoming[column] = previous[column];
          }
        }
      }

      const existingFingerprints = new Set<string>(
        existingByFingerprint.keys(),
      );

      // Chunk the upsert so no single statement exceeds Postgres' 65535
      // parameter ceiling — see VULNERABILITY_INSERT_CHUNK_SIZE.
      const insertedVulnerabilities: Vulnerability[] = [];
      for (
        let offset = 0;
        offset < uniqueValues.length;
        offset += VULNERABILITY_INSERT_CHUNK_SIZE
      ) {
        const chunk = uniqueValues.slice(
          offset,
          offset + VULNERABILITY_INSERT_CHUNK_SIZE,
        );
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(Vulnerability)
          .values(chunk)
          .orUpdate({
            conflict_target: ['fingerprint'],
            overwrite: [...RESCAN_OVERWRITE_COLUMNS],
          })
          .returning('*')
          .execute();
        insertedVulnerabilities.push(...(result.raw as Vulnerability[]));
      }

      // Only send notifications for truly new vulnerabilities,
      // not for existing ones that were just updated
      const vulsForAlert = insertedVulnerabilities.filter(
        (vuln) =>
          vuln.fingerprint &&
          !existingFingerprints.has(vuln.fingerprint) &&
          vuln.severity,
      );

      if (vulsForAlert.length > 0) {
        this.logger.log(
          `Found ${vulsForAlert.length} new vulns for job ${job.id}, looking up workspace`,
        );

        const members =
          await this.workspaceService.getMemberOfWorkspaceByJobId(job.id);

        if (members.length === 0) {
          this.logger.warn(
            `No workspace resolved for job ${job.id}, skipping the event`,
          );
          return;
        }

        const workspaceId = members[0].workspace.id;

        this.logger.log(
          `Publishing vulnerability.detected for ${vulsForAlert.length} vulns in workspace ${workspaceId}`,
        );

        // Report the FINDING, not a notification decision: who is told about
        // it (and in what wording) belongs to the `notifications` consumer. The
        // count and the asset identity travel as payload because the consumer
        // cannot re-derive them from the workspace alone.
        //
        // One event for the whole batch, not one per vulnerability: a scan that
        // finds 200 issues must not push 200 notifications.
        await this.eventBridge.publishSafely(EVENT_CATALOG.vulnerability.detected, {
          workspaceId,
          outcome: 'success',
          resourceType: 'vulnerability',
          payload: {
            count: vulsForAlert.length,
            jobId: job.id,
            assetValue: job.asset.value,
            assetId: job.asset.id,
            targetId: job.asset.target.id,
          },
        });
      } else {
        this.logger.log(
          `No new vulns to alert for job ${job.id} (${uniqueValues.length} total deduped, ${existingFingerprints.size} already existed)`,
        );
      }
    });
  }

  public async screenshot({
    data,
    job,
  }: DataAdapterInput<ScreenshotPayload>): Promise<void> {
    if (!data.screenshot || !data.url) {
      return;
    }

    const buffer = Buffer.from(data.screenshot, 'base64');
    const { path } = await this.storageService.uploadFile(
      `${crypto.createHash('md5').update(job.asset.value).digest('hex')}.png`,
      buffer,
      'screenshot',
    );
    if (path) {
      await this.dataSource
        .createQueryBuilder()
        .update(AssetService)
        .set({ screenshotPath: path })
        .where({ id: job.assetServiceId })
        .execute();
    }

    return;
  }

  /**
   * Sync data based on tool category
   * @param payload Data to sync
   * @returns
   */
  public async syncData({
    job,
    data,
  }: DataAdapterInput<JobDataResultType>): Promise<void> {
    try {
      // Define type for sync function configuration
      type SyncFunctionConfig<T = unknown> = {
        handler: (data: DataAdapterInput<T>) => Promise<void | InsertResult>;
        validationClass?: new () => object;
      };

      // Map of tool categories to their corresponding sync functions and validation classes
      const syncFunctions: Partial<
        Record<ToolCategory, SyncFunctionConfig<unknown>>
      > = {
        [ToolCategory.PORTS_SCANNER]: {
          handler: (data: DataAdapterInput<number[]>) =>
            this.portsScanner(data),
        },
        [ToolCategory.SUBDOMAINS]: {
          handler: (data: DataAdapterInput<Asset[]>) => this.subdomains(data),
          // validationClass: Asset,
        },
        [ToolCategory.HTTP_PROBE]: {
          handler: (data: DataAdapterInput<HttpResponse>) =>
            this.httpResponses(data),
          // validationClass: HttpResponse, // no validate for now
        },
        [ToolCategory.VULNERABILITIES]: {
          handler: (data: DataAdapterInput<Vulnerability[]>) =>
            this.vulnerabilities(data),
          // validationClass: Vulnerability,
        },
        [ToolCategory.SCREENSHOT]: {
          handler: (data: DataAdapterInput<ScreenshotPayload>) =>
            this.screenshot(data),
          validationClass: ScreenshotPayload,
        },
        [ToolCategory.URL_DISCOVERY]: {
          handler: (data: DataAdapterInput<DiscoveredUrl[]>) =>
            this.urlDiscovery(data),
        },
      };

      // Get the appropriate sync function based on category
      if (!job.tool.category) {
        throw new Error('Tool category is undefined');
      }

      const syncFunction = syncFunctions[job.tool.category];

      // Check if we have a function for this category
      if (!syncFunction) {
        throw new Error(`Unsupported tool category: ${job.tool.category}`);
      }

      // Validate data before syncing
      if (syncFunction.validationClass && data !== undefined) {
        const isValid = await this.validateData(
          data,
          syncFunction.validationClass,
        );
        if (!isValid) {
          throw new Error(
            `Data validation failed for category: ${job.tool.category}`,
          );
        }
      }

      // Call the appropriate sync function with proper type assertion
      const typedData = { job, data } as unknown as DataAdapterInput<unknown>;
      await syncFunction.handler(typedData);

      return;
    } catch (error) {
      this.logger.error(
        `syncData failed for job ${job.id} (category: ${job.tool.category}):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
