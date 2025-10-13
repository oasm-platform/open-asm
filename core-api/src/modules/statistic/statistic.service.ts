import { Injectable } from '@nestjs/common';
import { DataSource, MoreThanOrEqual } from 'typeorm';

import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';
import { TimelineResponseDto } from './dto/timeline.dto';
import { Statistic } from './entities/statistic.entity';

@Injectable()
export class StatisticService {
  constructor(private readonly dataSource: DataSource) { }

  private async getStatistic(workspaceId: string): Promise<Statistic | null> {
    return this.dataSource.getRepository(Statistic).findOne({
      where: { workspace: { id: workspaceId } },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * Retrieves the total count of targets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of targets.
   */
  async getTotalTargets(query: GetStatisticQueryDto): Promise<number> {
    const stats = await this.getStatistic(query.workspaceId);
    return stats?.targets ?? 0;
  }

  /**
   * Retrieves the total count of assets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of assets.
   */
  async getTotalAssets(query: GetStatisticQueryDto): Promise<number> {
    const stats = await this.getStatistic(query.workspaceId);
    return stats?.assets ?? 0;
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  async getTotalVulnerabilities(query: GetStatisticQueryDto): Promise<number> {
    const stats = await this.getStatistic(query.workspaceId);
    return stats?.vuls ?? 0;
  }

  /**
   * Retrieves the total count of unique technologies in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  async getTotalUniqueTechnologies(query: GetStatisticQueryDto): Promise<number> {
    const stats = await this.getStatistic(query.workspaceId);
    return stats?.techs ?? 0;
  }

  /**
   * Retrieves all statistics for a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(query: GetStatisticQueryDto): Promise<StatisticResponseDto & { totalUniqueTechnologies: number }> {
    const stats = await this.getStatistic(query.workspaceId);

    return {
      totalTargets: stats?.targets ?? 0,
      totalAssets: stats?.assets ?? 0,
      totalVulnerabilities: stats?.vuls ?? 0,
      totalUniqueTechnologies: stats?.techs ?? 0,
    };
  }

  /**
   * Retrieves timeline statistics for a workspace within the last 3 months
   *
   * @param query - The query parameters containing workspaceId
   * @returns A promise that resolves to timeline statistics
   */
  async getTimelineStatistics(workspaceId: string): Promise<TimelineResponseDto> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const statistics = await this.dataSource.getRepository(Statistic).find({
      where: {
        workspace: { id: workspaceId },
        createdAt: MoreThanOrEqual(threeMonthsAgo),
      },
      order: {
        createdAt: 'ASC',
      },
    });

    return {
      data: statistics,
      total: statistics.length,
    };
  }
}