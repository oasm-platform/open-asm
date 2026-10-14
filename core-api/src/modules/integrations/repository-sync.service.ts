import { BullMQName, IntegrationType, TargetType } from '@/common/enums/enum';
import {
  Asset,
  type RepositoryAssetMetadata,
} from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { hasCapability } from './capabilities';
import type { SourceRepository } from './connectors/connector.abstract';
import { resolveSourceCodeConnector } from './connectors/connector.factory';
import { IntegrationsService } from './integrations.service';
import { gitOrgOwner, planRepositorySync } from './repository-sync.plan';

/** Upper bound on one sync; the listing stops paging past it. */
const MAX_SYNC_DURATION_MS = 10 * 60 * 1000;
/** 100 pages × 100 = 10 000 repositories per organization. */
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const ASSET_WRITE_CHUNK = 200;

export interface RepositorySyncJob {
  targetId: string;
  workspaceId: string;
}

export interface RepositorySyncResult {
  status: 'synced' | 'skipped';
  reason?: string;
  repositories: number;
  created: number;
  updated: number;
  disabled: number;
  /** True when paging stopped early (cap or deadline): nothing was disabled. */
  truncated: boolean;
}

/**
 * Repository metadata as the jsonb column value. TypeORM's deep-partial
 * typing rejects `null` members of a `Record<string, unknown>` column even
 * though jsonb stores them fine.
 */
const asJson = (
  metadata: RepositoryAssetMetadata,
): QueryDeepPartialEntity<Asset>['metadata'] =>
  ({ ...metadata }) as unknown as QueryDeepPartialEntity<Asset>['metadata'];

const skipped = (reason: string): RepositorySyncResult => ({
  status: 'skipped',
  reason,
  repositories: 0,
  created: 0,
  updated: 0,
  disabled: 0,
  truncated: false,
});

/**
 * Keeps the repositories of GIT_ORG targets in sync with the provider. Each
 * repository is an asset of its target (value `github.com/acme/web`,
 * provider details in `metadata`).
 *
 * Triggers, all funnelled into one BullMQ job per target (deduped by jobId):
 * - `target.git_org.create`  — a GIT_ORG target was added;
 * - `target.git_org.re-scan` — "Sync now", or the target's scan schedule.
 *
 * A finished sync emits `target.git_org.synced`; workflows that scan
 * repositories trigger on it (not on `create`, when no repository exists yet).
 */
@Injectable()
export class RepositorySyncService {
  private readonly logger = new Logger(RepositorySyncService.name);

  constructor(
    @InjectRepository(Target)
    private readonly targetRepository: Repository<Target>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    private readonly integrationsService: IntegrationsService,
    private readonly redisLockService: RedisLockService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(BullMQName.REPOSITORY_SYNC)
    private readonly queue: Queue<RepositorySyncJob>,
  ) {}

  @OnEvent('target.git_org.create')
  @OnEvent('target.git_org.re-scan')
  async onGitOrgTargetEvent(target: Pick<Target, 'id' | 'workspaceId'>): Promise<void> {
    try {
      await this.enqueue(target.id, target.workspaceId);
    } catch (error) {
      // Event listeners must never throw into the emitter.
      this.logger.error(
        `Failed to enqueue repository sync for target ${target.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Queues a sync; a sync already queued for the target is reused. */
  async enqueue(targetId: string, workspaceId: string): Promise<void> {
    await this.queue.add(
      'sync',
      { targetId, workspaceId },
      {
        jobId: `repository-sync-${targetId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Runs one sync (called by the processor). */
  async syncTarget(
    targetId: string,
    workspaceId: string,
  ): Promise<RepositorySyncResult> {
    const target = await this.targetRepository.findOne({
      where: { id: targetId, workspaceId },
    });
    if (!target || target.type !== TargetType.GIT_ORG) {
      return skipped('target not found or not a Git organization');
    }
    if (!target.integrationId) {
      // Integration removed (SET NULL): keep the target and its history,
      // just stop syncing until another integration is attached.
      this.logger.warn(
        `Target ${target.id} (${target.value}) has no integration; repository sync skipped`,
      );
      return skipped('no integration attached');
    }

    let integration: Awaited<
      ReturnType<IntegrationsService['getIntegrationWithDecryptedConfig']>
    >;
    try {
      integration = await this.integrationsService.getIntegrationWithDecryptedConfig(
        target.integrationId,
        workspaceId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return skipped('integration not found');
      }
      throw error;
    }
    if (!hasCapability(integration.integration, IntegrationType.SOURCE_CODE)) {
      return skipped('integration has no SOURCE_CODE capability');
    }

    const result = await this.redisLockService.withLock(
      `repository-sync:${target.id}`,
      MAX_SYNC_DURATION_MS,
      () =>
        this.reconcile(
          target,
          integration.integration.appType,
          integration.decryptedConfig,
        ),
    );
    if (result === null) {
      return skipped('sync already in progress');
    }

    await this.targetRepository.update(target.id, {
      lastDiscoveredAt: new Date(),
    });
    this.eventEmitter.emit('target.git_org.synced', target);
    this.logger.log(
      `Repository sync for ${target.value}: ${JSON.stringify(result)}`,
    );
    return result;
  }

  private async reconcile(
    target: Target,
    provider: string,
    config: Record<string, unknown>,
  ): Promise<RepositorySyncResult> {
    const { repositories, complete } = await this.fetchAll(
      provider,
      config,
      gitOrgOwner(target.value),
    );

    const existing = await this.assetRepository.find({
      where: { targetId: target.id },
      select: { id: true, value: true, isEnabled: true, metadata: true },
    });

    const plan = planRepositorySync({
      existing,
      repositories,
      provider,
      settings: target.settings,
      complete,
    });

    await this.assetRepository.manager.transaction(async (manager) => {
      const assets = manager.getRepository(Asset);
      // Order matters for the (value, targetId) unique constraint: move stale
      // rows aside, then rename/refresh matched rows, then insert new ones.
      for (const { id, value } of plan.renames) {
        await assets.update(id, { value });
      }
      for (const update of plan.updates) {
        await assets.update(update.id, {
          value: update.value,
          isEnabled: update.isEnabled,
          metadata: asJson(update.metadata),
        });
      }
      for (let i = 0; i < plan.inserts.length; i += ASSET_WRITE_CHUNK) {
        await assets.insert(
          plan.inserts.slice(i, i + ASSET_WRITE_CHUNK).map((planned) => ({
            value: planned.value,
            isEnabled: planned.isEnabled,
            isPrimary: false,
            metadata: asJson(planned.metadata),
            targetId: target.id,
          })),
        );
      }
      if (plan.disableIds.length > 0) {
        await assets.update({ id: In(plan.disableIds) }, { isEnabled: false });
      }
    });

    return {
      status: 'synced',
      repositories: repositories.length,
      created: plan.inserts.length,
      updated: plan.updates.length,
      disabled: plan.disableIds.length,
      truncated: !complete,
    };
  }

  /**
   * Pages through every repository of the owner. Stops early at the page cap
   * or the time budget and reports the listing as incomplete.
   */
  private async fetchAll(
    provider: string,
    config: Record<string, unknown>,
    owner: string,
  ): Promise<{ repositories: SourceRepository[]; complete: boolean }> {
    const connector = resolveSourceCodeConnector(provider);
    const deadline = Date.now() + MAX_SYNC_DURATION_MS;
    const repositories: SourceRepository[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await connector.listRepositories(config, {
        owner,
        page,
        limit: PAGE_SIZE,
      });
      repositories.push(...result.data);
      if (!result.hasNextPage) {
        return { repositories, complete: true };
      }
      if (Date.now() > deadline) break;
    }
    this.logger.warn(
      `Repository listing for ${owner} stopped after ${repositories.length} repositories (page cap or time budget)`,
    );
    return { repositories, complete: false };
  }
}
