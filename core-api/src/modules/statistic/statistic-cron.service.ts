import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { AssetsService } from '../assets/assets.service';
import { TargetsService } from '../targets/targets.service';
import { VulnerabilitiesService } from '../vulnerabilities/vulnerabilities.service';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Statistic } from './entities/statistic.entity';

@Injectable()
export class StatisticCronService implements OnModuleInit {
    constructor(
        private readonly targetsService: TargetsService,
        private readonly assetsService: AssetsService,
        private readonly vulnerabilitiesService: VulnerabilitiesService,
        private readonly dataSource: DataSource,
    ) { }

    async onModuleInit() {
        await this.handleCron();
    }

    @Cron('0 0 * * *')
    async handleCron() {
        const workspaces = await this.dataSource.getRepository(Workspace).find();
        const workspaceIds = workspaces.map((workspace) => workspace.id);

        if (workspaceIds.length === 0) {
            return;
        }

        const statistics = await Promise.all(
            workspaceIds.map(async (workspaceId) => {
                const totalAssets = await this.assetsService.countAssetsInWorkspace(workspaceId);
                const totalTargets = await this.targetsService.countTargetsInWorkspace(workspaceId);
                const totalVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId);
                const criticalVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId, 'critical');
                const highVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId, 'high');
                const mediumVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId, 'medium');
                const lowVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId, 'low');
                const infoVuls = await this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(workspaceId, 'info');
                const totalTechs = await this.assetsService.countUniqueTechnologiesInWorkspace(workspaceId);
                const totalPorts = await this.assetsService.countUniquePortsInWorkspace(workspaceId);

                const statistic = new Statistic();
                statistic.assets = totalAssets;
                statistic.targets = totalTargets;
                statistic.vuls = totalVuls;
                statistic.criticalVuls = criticalVuls;
                statistic.highVuls = highVuls;
                statistic.mediumVuls = mediumVuls;
                statistic.lowVuls = lowVuls;
                statistic.infoVuls = infoVuls;
                statistic.techs = totalTechs;
                statistic.ports = totalPorts;
                statistic.workspace = { id: workspaceId } as Workspace;

                return statistic;
            }),
        );

        await this.dataSource.getRepository(Statistic).save(statistics);
    }
}