import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { Target } from '../targets/entities/target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Statistic } from './entities/statistic.entity';

@Injectable()
export class StatisticCronService {
    constructor(private readonly dataSource: DataSource) { }
    @Cron('0 0 * * *')
    async handleCron() {
        const workspaces = await this.dataSource.getRepository(Workspace).find({ select: ['id'] });
        if (workspaces.length === 0) {
            return;
        }

        const workspaceIds = workspaces.map((workspace) => workspace.id);

        const assetCounts = await this.getAssetCounts(workspaceIds);
        const targetCounts = await this.getTargetCounts(workspaceIds);
        const vulnerabilityCounts = await this.getVulnerabilityCounts(workspaceIds);
        const techCounts = await this.getTechCounts(workspaceIds);
        const portCounts = await this.getPortCounts(workspaceIds);

        const statisticsMap = new Map<string, Statistic>();

        for (const id of workspaceIds) {
            const statistic = new Statistic();
            statistic.workspace = { id } as Workspace;
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

        assetCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.assets = Number(row.count);
        });

        targetCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.targets = Number(row.count);
        });

        vulnerabilityCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) {
                stat.vuls += Number(row.count);
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

        techCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.techs = Number(row.count);
        });

        portCounts.forEach((row) => {
            const stat = statisticsMap.get(row.workspaceId);
            if (stat) stat.ports = Number(row.count);
        });

        const statistics = Array.from(statisticsMap.values());
        await this.dataSource.getRepository(Statistic).save(statistics);
    }

    private getAssetCounts(workspaceIds: string[]) {
        return this.dataSource
            .getRepository(Asset)
            .createQueryBuilder('asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('COUNT(asset.id)', 'count')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds })
            .andWhere('asset.isErrorPage = false')
            .groupBy('wt.workspaceId')
            .getRawMany<{ workspaceId: string; count: string }>();
    }

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

    private getTechCounts(workspaceIds: string[]) {
        const subQuery = this.dataSource
            .createQueryBuilder()
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('unnest(http.tech)', 'tech')
            .from(HttpResponse, 'http')
            .leftJoin('http.asset', 'asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

        return this.dataSource
            .createQueryBuilder()
            .select('sq."workspaceId"', 'workspaceId')
            .addSelect('COUNT(DISTINCT sq.tech)', 'count')
            .from(`(${subQuery.getQuery()})`, 'sq')
            .setParameters(subQuery.getParameters())
            .groupBy('sq."workspaceId"')
            .getRawMany<{ workspaceId: string; count: string }>();
    }

    private getPortCounts(workspaceIds: string[]) {
        const subQuery = this.dataSource
            .createQueryBuilder()
            .select('wt.workspaceId', 'workspaceId')
            .addSelect('unnest(port.ports)', 'port')
            .from(Port, 'port')
            .leftJoin('port.asset', 'asset')
            .leftJoin('asset.target', 'target')
            .leftJoin('target.workspaceTargets', 'wt')
            .where('wt.workspaceId IN (:...workspaceIds)', { workspaceIds });

        return this.dataSource
            .createQueryBuilder()
            .select('sq."workspaceId"', 'workspaceId')
            .addSelect('COUNT(DISTINCT sq.port)', 'count')
            .from(`(${subQuery.getQuery()})`, 'sq')
            .setParameters(subQuery.getParameters())
            .groupBy('sq."workspaceId"')
            .getRawMany<{ workspaceId: string; count: string }>();
    }
}