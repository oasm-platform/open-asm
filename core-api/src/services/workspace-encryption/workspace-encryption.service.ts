import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import {
  generateDEK,
  unwrapDEK,
  wrapDEK,
} from '@/common/utils/workspace-encryption.util';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { RedisLockService } from '@/services/redis/distributed-lock.service';

/**
 * Centralized service for workspace-level Data Encryption Key (DEK) resolution.
 *
 * Each workspace gets its own DEK (envelope encryption). This service fetches
 * the wrapped DEK from the workspace record and unwraps it using the system KEK.
 *
 * Services that need workspace-aware encryption inject this service instead of
 * duplicating the Workspace repository query + unwrapDEK call.
 */
@Injectable()
export class WorkspaceEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceEncryptionService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly redisLockService: RedisLockService,
  ) {}

  async onModuleInit() {
    const lockKey = 'workspace-dek-backfill';
    // TTL generous enough for backfill; withLock releases promptly on completion.
    const lockTTL = 60_000;

    const ran = await this.redisLockService.withLock(
      lockKey,
      lockTTL,
      async () => this.backfillMissingDEKs(),
    );

    if (ran === null) {
      this.logger.log(
        'Another instance holds the DEK backfill lock, skipping',
      );
    }
  }

  /**
   * Backfill DEK for all workspaces missing one (pre-envelope-encryption).
   * Protected by distributed lock — only one instance executes this at a time.
   */
  private async backfillMissingDEKs(): Promise<void> {
    const workspaces = await this.workspaceRepo.find({
      where: { dek: IsNull() },
      select: ['id'],
    });

    if (workspaces.length === 0) {
      this.logger.log('All workspaces already have a DEK, nothing to backfill');
      return;
    }

    this.logger.log(
      `Backfilling DEK for ${workspaces.length} workspace(s)...`,
    );

    let success = 0;
    for (const ws of workspaces) {
      try {
        await this.ensureDEK(ws.id);
        success++;
      } catch (err) {
        this.logger.error(
          `Failed to generate DEK for workspace ${ws.id}`,
          err,
        );
      }
    }

    this.logger.log(
      `DEK backfill complete: ${success}/${workspaces.length} workspace(s) updated`,
    );
  }

  /**
   * Generate a DEK and persist the wrapped form for a specific workspace.
   */
  async ensureDEK(workspaceId: string): Promise<void> {
    const dek = generateDEK();
    const wrappedDEK = wrapDEK(dek);
    await this.workspaceRepo.update(workspaceId, {
      dek: wrappedDEK,
      dekAt: new Date(),
    });
  }

  /**
   * Generate and return a wrapped DEK string.
   * Useful for creation flows that save the workspace entity in one shot.
   */
  generateWrappedDEK(): string {
    return wrapDEK(generateDEK());
  }

  /**
   * Fetch and unwrap the DEK for a given workspace.
   * Returns null for old/pre-envelope-encryption workspaces (backward compat).
   */
  async getDEK(workspaceId: string): Promise<Buffer | null> {
    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
      select: ['dek'],
    });
    if (!workspace?.dek) return null;
    return unwrapDEK(workspace.dek);
  }
}
