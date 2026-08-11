import { ScreenshotPayload } from '@/common/interfaces/app.interface';
import { JobDataResultType } from '@/common/types/app.types';
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as crypto from 'crypto';
import { DataSource, InsertResult } from 'typeorm';
import {
  NotificationScope,
  NotificationType,
  ToolCategory,
} from '../../common/enums/enum';
import { AssetService } from '../assets/entities/asset-services.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { IssuesService } from '../issues/issues.service';
import { NotificationsService } from '../notifications/notifications.service';
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

@Injectable()
export class DataAdapterService {
  private readonly logger = new Logger(DataAdapterService.name);

  constructor(
    private readonly dataSource: DataSource,
    private workspaceService: WorkspacesService,
    private issuesService: IssuesService,
    private storageService: StorageService,
    private readonly notificationsService: NotificationsService,
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
   * HTTP responses data normalization
   * @param param0
   * @returns
   */
  public async httpResponses({
    data,
    job,
  }: DataAdapterInput<HttpResponse>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (data.failed && job.assetServiceId) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(AssetService)
          .set({ isErrorPage: true })
          .where({ id: job.assetServiceId })
          .execute();
      }

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(HttpResponse)
        .values((() => {
          const values = { ...data } as unknown as Record<string, string | number | boolean | object | null>;
          delete values.id;
          return {
            ...values,
            assetServiceId: job.assetService?.id,
            jobHistoryId: job.jobHistory.id,
          };
        })())
        .execute();

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

      // Pre-check: find which fingerprints already exist
      // to avoid sending notifications for updated vulns
      const existingRows = await manager
        .createQueryBuilder()
        .select('v.fingerprint', 'fingerprint')
        .from(Vulnerability, 'v')
        .where('v.fingerprint IN (:...fingerprints)', {
          fingerprints: uniqueValues.map((v) => v.fingerprint),
        })
        .getRawMany();

      const existingFingerprints = new Set<string>(
        (existingRows as { fingerprint: string }[]).map((r) => r.fingerprint),
      );

      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(Vulnerability)
        .values(uniqueValues)
        .orUpdate({
          conflict_target: ['fingerprint'],
          overwrite: ['updatedAt', 'severity', 'lastSeenDate'],
        })
        .returning('*')
        .execute();

      const insertedVulnerabilities = result.raw as Vulnerability[];

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
          `Found ${vulsForAlert.length} new vulns for job ${job.id}, looking up workspace members`,
        );

        const members =
          await this.workspaceService.getMemberOfWorkspaceByJobId(job.id);

        if (members.length === 0) {
          this.logger.warn(
            `No workspace members found for job ${job.id}, skipping notification`,
          );
          return;
        }

        this.logger.log(
          `Found ${members.length} workspace members for job ${job.id}, creating notification`,
        );

        const recipientIds = members.map((m) => m.user.id);
        const workspaceId = members[0].workspace.id;

        await this.notificationsService.createNotification({
          recipients: recipientIds,
          scope: NotificationScope.GROUP,
          type: NotificationType.NEW_VULNERABILITY_FOUND,
          metadata: {
            count: String(vulsForAlert.length),
            assetValue: job.asset.value,
            targetId: job.asset.target.id,
            assetId: job.asset.id,
          },
          workspaceId,
        });

        this.logger.log(
          `Notification created for ${vulsForAlert.length} vulns in workspace ${workspaceId}`,
        );
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
