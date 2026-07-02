import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { StatisticService } from './statistic.service';

/**
 * Cron service for calculating and storing periodic statistics for workspaces.
 * Executes scheduled tasks to aggregate data from various entities
 * such as assets, targets, vulnerabilities, technologies, and ports.
 * Uses Redis distributed lock to ensure only one backend instance runs
 * the daily aggregation across multiple replicas.
 */
@Injectable()
export class StatisticCronService implements OnModuleInit {
  constructor(
    private readonly statisticService: StatisticService,
    private readonly redisLockService: RedisLockService,
  ) {}

  async onModuleInit() {
    // await this.handleCron();
  }

  /**
   * Handles the cron task to calculate and store statistics.
   * Runs daily at midnight (00:00).
   * Wrapped in a Redis distributed lock (1h TTL) so only one backend
   * instance executes the aggregation even with multiple replicas.
   */
  @Cron('0 0 * * *')
  async handleCron() {
    await this.redisLockService.withLock(
      'cron:statistic-daily',
      3_600_000,
      async () => {
        await this.statisticService.calculateAndStoreStatistics();
      },
    );
  }
}
