import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { AssetsService } from '../assets/assets.service';
import { TargetsService } from '../targets/targets.service';
import { VulnerabilitiesService } from '../vulnerabilities/vulnerabilities.service';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';
import { Statistic } from './entities/statistic.entity';

@Injectable()
export class StatisticService implements OnModuleInit {
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

  /**
   * Retrieves the total count of targets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of targets.
   */
  async getTotalTargets(query: GetStatisticQueryDto): Promise<number> {
    return this.targetsService.countTargetsInWorkspace(query.workspaceId);
  }

  /**
   * Retrieves the total count of assets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of assets.
   */
  async getTotalAssets(query: GetStatisticQueryDto): Promise<number> {
    return this.assetsService.countAssetsInWorkspace(query.workspaceId);
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  async getTotalVulnerabilities(query: GetStatisticQueryDto): Promise<number> {
    return this.vulnerabilitiesService.countVulnerabilitiesInWorkspace(query.workspaceId);
  }

  /**
   * Retrieves the total count of unique technologies in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  async getTotalUniqueTechnologies(query: GetStatisticQueryDto): Promise<number> {
    return this.assetsService.countUniqueTechnologiesInWorkspace(query.workspaceId);
  }

  /**
   * Retrieves all statistics for a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(query: GetStatisticQueryDto): Promise<StatisticResponseDto & { totalUniqueTechnologies: number }> {
    const [totalTargets, totalAssets, totalVulnerabilities, totalUniqueTechnologies] = await Promise.all([
      this.getTotalTargets(query),
      this.getTotalAssets(query),
      this.getTotalVulnerabilities(query),
      this.getTotalUniqueTechnologies(query),
    ]);

    return {
      totalTargets,
      totalAssets,
      totalVulnerabilities,
      totalUniqueTechnologies,
    };
  }
}