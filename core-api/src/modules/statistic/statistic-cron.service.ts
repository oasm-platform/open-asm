import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { StatisticService } from './statistic.service';

/**
 * Cron service for calculating and storing periodic statistics for workspaces.
 * Executes scheduled tasks to aggregate data from various entities
 * such as assets, targets, vulnerabilities, technologies, and ports.
 */
@Injectable()
export class StatisticCronService implements OnModuleInit {
    /**
     * Initializes an instance of StatisticCronService.
     * @param statisticService The service containing the database query logic for statistics.
     */
    constructor(private readonly statisticService: StatisticService) { }

    /**
     * Lifecycle hook called when the module is initialized.
     * Currently commented out to prevent running handleCron on module initialization.
     */
    async onModuleInit() {
        await this.handleCron(); // Uncomment to run the cron job on application startup
    }

    /**
     * Handles the cron task to calculate and store statistics.
     * Runs daily at midnight (00:00).
     * - Fetches all workspaces.
     * - Retrieves counts for assets, targets, vulnerabilities, technologies, and ports for each workspace.
     * - Aggregates the data and saves it to the statistics table.
     */
    @Cron('0 0 * * *') // Runs daily at midnight (00:00)
    async handleCron() {
        await this.statisticService.calculateAndStoreStatistics();
    }
}
