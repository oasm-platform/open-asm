import { BullMQName, IntegrationType } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import type { WrapperType } from '@/common/types/app.types';
import { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { IsNull, Not } from 'typeorm';
import type { Repository } from 'typeorm';
import type {
  CloudflareSyncConfig,
  SyncResult,
} from './connectors/cloudflare.connector';
import { runConnector } from './connectors/connector.factory';
import { Integration } from './entities/integration.entity';
import { IntegrationsService } from './integrations.service';

/**
 * Owns the BullMQ repeat scheduler for periodic asset syncs of cloud-provider
 * integrations (e.g. Cloudflare). Job name = integration.id (the dedup key),
 * the persisted repeatJobKey lives in `integrations.syncJobId`, mirroring the
 * target scan-schedule lifecycle (targets.service.ts).
 */
@Injectable()
export class IntegrationSyncService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationSyncService.name);

  constructor(
    @InjectQueue(BullMQName.INTEGRATION_SYNC_SCHEDULE)
    private readonly queue: Queue,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @Inject(forwardRef(() => IntegrationsService))
    private readonly integrationsService: WrapperType<IntegrationsService>,
    private readonly targetsService: TargetsService,
    private readonly dataAdapterService: DataAdapterService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Backfill: schedule repeat jobs for integrations that have a cron schedule
   * but no persisted scheduler key (rows created before the scheduler existed,
   * or jobs that lost their key). Mirrors targets.service.ts:655-675.
   */
  async onModuleInit(): Promise<void> {
    const pending = await this.integrationRepository.find({
      where: {
        // Only cloud-provider integrations can ever have a sync scheduler —
        // pre-existing rows of other categories are never re-scheduled (F3).
        category: IntegrationType.CLOUD_PROVIDER,
        syncSchedule: Not('disabled'),
        syncJobId: IsNull(),
      },
    });

    for (const integration of pending) {
      try {
        await this.addJobScheduler(integration);
      } catch (error) {
        this.logger.error(
          `Failed to backfill sync scheduler for integration ${integration.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Registers (or re-registers) the BullMQ repeat scheduler for an integration.
   * Always removes any previous scheduler first so a stale repeat key can never
   * survive a schedule change. Returns the repeatJobKey, persisted to
   * `integrations.syncJobId`.
   */
  async addJobScheduler(integration: Integration): Promise<string | null> {
    await this.removeJobScheduler(integration.id);

    if (integration.syncSchedule === 'disabled') return null;

    const job = await this.queue.add(
      integration.id, // job name is the BullMQ dedup key (BullMQ v5)
      { integrationId: integration.id, workspaceId: integration.workspaceId },
      { repeat: { pattern: integration.syncSchedule } },
    );

    integration.syncJobId = job.repeatJobKey ?? null;
    await this.integrationRepository.save(integration);
    return integration.syncJobId;
  }

  /**
   * Removes the BullMQ repeat scheduler for an integration using the persisted
   * repeatJobKey (NOT the raw integration id — same contract as
   * targets.service.ts:611-613). Missing row and missing scheduler are both
   * fine: the row may have been deleted and the scheduler already cleaned up.
   */
  async removeJobScheduler(integrationId: string): Promise<void> {
    const integration = await this.integrationRepository.findOneBy({
      id: integrationId,
    });
    if (!integration || !integration.syncJobId) return;

    try {
      await this.queue.removeJobScheduler(integration.syncJobId);
    } catch (error) {
      this.logger.warn(
        `Failed to remove sync scheduler ${integration.syncJobId} for integration ${integrationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    integration.syncJobId = null;
    await this.integrationRepository.save(integration);
  }

  /**
   * Enqueues one manual sync for an integration (POST /:id/sync) and returns
   * immediately — the actual sync runs asynchronously in the processor.
   *
   * The job name AND jobId are `manual-sync-<integrationId>`: the jobId is
   * the BullMQ dedup key, so a second POST while the first job is still
   * waiting/active returns the existing job instead of scheduling a duplicate
   * sync. attempts: 1 (a manual sync is never retried) + removeOnComplete
   * (the completed job is dropped, so the next POST creates a fresh job).
   */
  async enqueueManualSync(
    integrationId: string,
    workspaceId: string,
  ): Promise<{ jobId: string }> {
    const jobId = `manual-sync-${integrationId}`;
    const job = await this.queue.add(
      jobId,
      { integrationId, workspaceId },
      { jobId, attempts: 1, removeOnComplete: true },
    );
    return { jobId: job.id ?? jobId };
  }

  /**
   * Applies a schedule to an integration: 'disabled' removes the scheduler,
   * any other value re-registers it (removing the old scheduler first when the
   * schedule changed). Persists the integration row.
   */
  async applySchedule(
    integration: Integration,
    syncSchedule: string,
  ): Promise<void> {
    if (syncSchedule === 'disabled') {
      await this.removeJobScheduler(integration.id);
      integration.syncSchedule = 'disabled';
      // Keep the in-memory entity consistent with the DB row that
      // removeJobScheduler just cleared.
      integration.syncJobId = null;
    } else {
      if (integration.syncSchedule !== syncSchedule) {
        await this.removeJobScheduler(integration.id);
      }
      integration.syncSchedule = syncSchedule;
      await this.addJobScheduler(integration);
    }
    await this.integrationRepository.save(integration);
  }

  /**
   * Runs one asset sync for an integration: loads + decrypts the config,
   * dispatches the connector by appType and updates lastRunAt on success.
   * `dryRun` only fetches — no DB writes, no lastRunAt update.
   *
   * Note on job lifecycle: the processor's orphan guard covers QUEUED jobs
   * (the row is gone before the worker picks the job up). An in-flight job
   * may still finish its DB writes after the integration row is DELETEd —
   * accepted: the writes are workspace-scoped (targets/assets of that
   * workspace) and benign (same data a re-sync would produce).
   */
  async runSync(
    integrationId: string,
    workspaceId: string,
    opts?: { dryRun?: boolean },
  ): Promise<SyncResult> {
    const { integration, decryptedConfig } =
      await this.integrationsService.getIntegrationWithDecryptedConfig(
        integrationId,
        workspaceId,
      );

    // Deepest gate: the BullMQ repeat processor can still deliver jobs for
    // rows scheduled before the create/update gates existed. The connector
    // dispatch below is hardcoded to CLOUD_PROVIDER, so anything else would
    // fail every tick with "connector.syncAssets is not a function" (F3).
    if (integration.category !== (IntegrationType.CLOUD_PROVIDER as string)) {
      throw new BadRequestException(
        'syncSchedule is only supported for CLOUD_PROVIDER integrations',
      );
    }

    const config = {
      ...decryptedConfig,
      integrationId,
      workspaceId,
      __dryRun: opts?.dryRun ?? false,
      targetsService: this.targetsService,
      dataAdapterService: this.dataAdapterService,
      actingUserContext: await this.resolveActingUser(workspaceId, integration),
    } as unknown as CloudflareSyncConfig;

    const result = await runConnector(
      integration.appType,
      IntegrationType.CLOUD_PROVIDER,
      config,
    );

    if (!result.success) {
      // BadRequestException (not a plain Error) so callers can distinguish a
      // failed connector run (e.g. dry-run test → success:false result) from
      // a programming error, and the HTTP layer maps it to a 400.
      throw new BadRequestException(result.error ?? result.message);
    }

    if (!opts?.dryRun) {
      integration.lastRunAt = new Date();
      await this.integrationRepository.save(integration);
    }

    // The connector stashes its counts on the config (config.__syncResult)
    // before returning, so they flow back to the API response.
    return (
      config.__syncResult ?? {
        zones: 0,
        records: 0,
        wildcardZones: 0,
        targetsCreated: 0,
        assetsUpserted: 0,
      }
    );
  }

  /**
   * Lightweight existence check for the sync processor's orphan guard.
   * Workspace-scoped, selects only the id — NO config decryption, so a
   * stale queued job never triggers DEK/decrypt work just to be dropped.
   */
  async integrationExists(
    integrationId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const found = await this.integrationRepository.findOne({
      where: { id: integrationId, workspaceId },
      select: { id: true },
    });
    return Boolean(found);
  }

  /**
   * Resolves the acting user for target creation. Scheduled syncs run without
   * a request context, so we use the workspace owner (loaded via the `owner`
   * relation on Workspace). Falls back to the integration creator when the
   * owner cannot be resolved (plan section 8: "Resolve workspace owner làm
   * actingUserContext; nếu không tìm được → dùng user tạo integration").
   * When BOTH are missing the sync cannot attribute its writes → reject.
   */
  private async resolveActingUser(
    workspaceId: string,
    integration: Integration,
  ): Promise<UserContextPayload> {
    const [workspace] = await this.workspacesService.getWorkspacesByIds([
      workspaceId,
    ]);
    const ownerId = workspace?.owner?.id ?? integration.createdById;
    if (!ownerId) {
      throw new BadRequestException(
        'Cannot resolve acting user for integration sync — workspace owner and integration creator are both missing',
      );
    }
    return { id: ownerId } as UserContextPayload;
  }
}
