import { Lock } from '@/services/redis/lock.decorator';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArtifactsService } from './artifacts.service';

/**
 * Releases quota held by abandoned uploads and retries object deletes that
 * failed during `DELETE /artifacts/:id`. Every 5 minutes, one replica at a
 * time.
 */
@Injectable()
export class ArtifactSweepService {
  private readonly logger = new Logger(ArtifactSweepService.name);

  constructor(private readonly artifactsService: ArtifactsService) {}

  @Cron('*/5 * * * *')
  @Lock('cron:artifacts-sweep', { ttl: 10 * 60 * 1000 })
  async sweep(): Promise<void> {
    const purged = await this.artifactsService.purgeStale();
    if (purged > 0) {
      this.logger.log(`Purged ${purged} stale artifact(s)`);
    }
  }
}
