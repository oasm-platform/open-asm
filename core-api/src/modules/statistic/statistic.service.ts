import { Injectable } from '@nestjs/common';
import { AssetsService } from '../assets/assets.service';
import { TargetsService } from '../targets/targets.service';
import { VulnerabilitiesService } from '../vulnerabilities/vulnerabilities.service';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';

@Injectable()
export class StatisticService {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly assetsService: AssetsService,
    private readonly vulnerabilitiesService: VulnerabilitiesService,
  ) {}

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