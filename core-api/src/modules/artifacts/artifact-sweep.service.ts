import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArtifactsService } from './artifacts.service';

/**
 * Releases quota held by abandoned uploads and retries object deletes that
 * failed during `DELETE /artifacts/:id`. Every 5 minutes, one replica at a
 * time (Redis lock).
 */
@Injectable()
export class ArtifactSweepService {
  private readonly logger = new Logger(ArtifactSweepService.name);

  constructor(
    private readonly artifactsService: ArtifactsService,
    private readonly redisLockService: RedisLockService,
  ) {}

  @Cron('*/5 * * * *')
  async sweep(): Promise<void> {
    await this.redisLockService.withLock(
      'cron:artifacts-sweep',
      10 * 60 * 1000,
      async () => {
        const purged = await this.artifactsService.purgeStale();
        if (purged > 0) {
          this.logger.log(`Purged ${purged} stale artifact(s)`);
        }
      },
    );
  }
}
