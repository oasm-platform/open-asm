import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { Target } from '../targets/entities/target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Statistic } from './entities/statistic.entity';

/**
 * Cron service for calculating and storing periodic statistics for workspaces.
 * Executes scheduled tasks to aggregate data from various entities
 * such as assets, targets, vulnerabilities, technologies, and ports.
 */
@Injectable()
export class StatisticCronService implements OnModuleInit {
    /**
     * Initializes an instance of StatisticCronService.
     * @param dataSource The TypeORM data source for database interaction.
     */
    constructor(private readonly dataSource: DataSource) { }

    /**
     * Lifecycle hook called when the module is initialized.
     * Currently commented out to prevent running handleCron on module initialization.
     */
    async onModuleInit() {
        // await this.handleCron(); // Uncomment to run the cron job on application startup
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
        // Retrieve all existing workspaces
        const workspaces = await this.dataSource.getRepository(Workspace).find({ select: ['id'] });
        if (workspaces.length === 0) {
            // No workspaces found, no statistics to calculate
            return;
        }

        // Extract IDs of the workspaces
        const workspaceIds = workspaces.map((workspace) => workspace.id);

        // Fetch counts for each data type
        const assetCounts = await this.getAssetCounts(workspaceIds);
        const targetCounts = await this.getTargetCounts(workspaceIds);
        const vulnerabilityCounts = await this.getVulnerabilityCounts(workspaceIds);
        const techCounts = await this.getTechCounts(workspaceIds);
        const portCounts = await this.getPortCounts(workspaceIds);

        // Initialize a Map to store statistics for each workspace
        const statisticsMap = new Map<string, Statistic>();

        // Initialize default statistic objects for each workspace
        for (const id of workspaceIds) {
            const statistic = new Statistic();
            statistic.workspace = { id } as Workspace; // Assign workspace
            statistic.assets = 0;
            statistic.targets = 0;
            statistic.vuls = 0;
            statistic.criticalVuls = 0;
            statistic.highVuls = 0;
            statistic.mediumVuls = 0;
            statistic.lowVuls = 0;
            statistic.infoVuls = 0;
            statistic.techs = 0;
            statistic.ports = 0;
            statisticsMap.set(id, statistic);
        }

        // Update asset counts in the statistics Map
        assetCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.assets = Number(row.count);
        });

        // Update target counts in the statistics Map
        targetCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.targets = Number(row.count);
        });

        // Update vulnerability counts and categorize by severity
        vulnerabilityCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) {
                stat.vuls += Number(row.count); // Total vulnerabilities
                switch (row.severity) {
                    case 'critical':
                        stat.criticalVuls = Number(row.count);
                        break;
                    case 'high':
                        stat.highVuls = Number(row.count);
                        break;
                    case 'medium':
                        stat.mediumVuls = Number(row.count);
                        break;
                    case 'low':
                        stat.lowVuls = Number(row.count);
                        break;
                    case 'info':
                        stat.infoVuls = Number(row.count);
                        break;
                }
            }
        });

        // Update technology counts in the statistics Map
        techCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.techs = Number(row.count);
        });

        // Update port counts in the statistics Map
        portCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.ports = Number(row.count);
        });

        // Convert the Map to an array and save to the database
        const statistics = Array.from(statisticsMap.values());
        await this.dataSource.getRepository(Statistic).save(statistics);
    }

    /**
     * Retrieves the count of assets for each workspace.
     * Only includes assets that are not error pages.
     * @param workspaceIds An array of workspace IDs.
     * @returns An array of objects containing the workspaceId and asset count.
     */
    private getAssetCounts(workspaceIds: string[]) {
        return this.dataSource
            .getRepository(Asset)
            .createQueryBuilder('asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('COUNT(asset.id)', 'count')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .andWhere('asset.isErrorPage = false') // Only count assets that are not error pages
            .groupBy('wt.workspaceId')
            .getRawMany<{ workspaceId: string; count: string }>();
    }

    /**
     * Retrieves the count of targets for each workspace.
     * @param workspaceIds An array of workspace IDs.
     * @returns An array of objects containing the workspaceId and target count.
     */
    private getTargetCounts(workspaceIds: string[]) {
        return this.dataSource
            .getRepository(Target)
            .createQueryBuilder('target')
            .leftJoin('target.workspaceTargets', 'wt')
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('COUNT(target.id)', 'count')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .groupBy('wt.workspaceId')
            .getRawMany<{ workspaceId: string; count: string }>();
    }

    /**
     * Retrieves the count of vulnerabilities for each workspace, grouped by severity.
     * @param workspaceIds An array of workspace IDs.
     * @returns An array of objects containing the workspaceId, severity, and vulnerability count.
     */
    private getVulnerabilityCounts(workspaceIds: string[]) {
        return this.dataSource
            .getRepository(Vulnerability)
            .createQueryBuilder('vuln')
            .leftJoin('vuln.asset', 'asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('vuln.severity', 'severity')
            .addSelect('COUNT(vuln.id)', 'count')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .groupBy('wt.workspaceId, vuln.severity')
            .getRawMany<{ workspaceId: string; severity: string; count: string }>();
    }

    /**
     * Retrieves the count of unique technologies for each workspace.
     * Uses a subquery to unnest the technology array and count distinct values.
     * @param workspaceIds An array of workspace IDs.
     * @returns An array of objects containing the workspaceId and unique technology count.
     */
    private getTechCounts(workspaceIds: string[]) {
        // Subquery to unnest the 'tech' array from HttpResponse and link to workspaceId
        const subQuery = this.dataSource
            .createQueryBuilder()
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('unnest(http.tech)', 'tech') // Unnest the 'tech' array
            .from(HttpResponse, 'http')
            .leftJoin('http.asset', 'asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

        // Main query to count distinct technologies for each workspaceId
        return this.dataSource
            .createQueryBuilder()
            .select('sq."workspaceId"', 'workspaceId')
            .addSelect('COUNT(DISTINCT sq.tech)', 'count') // Count distinct technologies
            .from(`(${subQuery.getQuery()})`, 'sq')
            .setParameters(subQuery.getParameters())
            .groupBy('sq."workspaceId"')
            .getRawMany<{ workspaceId: string; count: string }>();
    }

    /**
     * Retrieves the count of unique ports for each workspace.
     * Uses a subquery to unnest the ports array and count distinct values.
     * @param workspaceIds An array of workspace IDs.
     * @returns An array of objects containing the workspaceId and unique port count.
     */
    private getPortCounts(workspaceIds: string[]) {
        // Subquery to unnest the 'ports' array from Port and link to workspaceId
        const subQuery = this.dataSource
            .createQueryBuilder()
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('unnest(port.ports)', 'port') // Unnest the 'ports' array
            .from(Port, 'port')
            .leftJoin('port.asset', 'asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

        // Main query to count distinct ports for each workspaceId
        return this.dataSource
            .createQueryBuilder()
            .select('sq."workspaceId"', 'workspaceId')
            .addSelect('COUNT(DISTINCT sq.port)', 'count') // Count distinct ports
            .from(`(${subQuery.getQuery()})`, 'sq')
            .setParameters(subQuery.getParameters())
            .groupBy('sq."workspaceId"')
            .getRawMany<{ workspaceId: string; count: string }>();
    }
}