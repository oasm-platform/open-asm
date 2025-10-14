import { Injectable } from '@nestjs/common';
import { DataSource, MoreThanOrEqual } from 'typeorm';

import { AssetTag } from '../assets/entities/asset-tags.entity';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';
import { TimelineResponseDto } from './dto/timeline.dto';
import { IssuesTimelineResponseDto } from './dto/issues-timeline.dto';
import { TopTagAsset } from './dto/top-tags-assets.dto';
import { Statistic } from './entities/statistic.entity';

@Injectable()
export class StatisticService {
  constructor(private readonly dataSource: DataSource) { }

  /**
   * Retrieves the total count of targets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of targets.
   */
  private async countTargets(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(WorkspaceTarget)
      .count({ where: { workspace: { id: workspaceId } } });
  }

  /**
   * Retrieves the total count of assets in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of assets.
   */
  private async countAssets(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(Asset)
      .createQueryBuilder('asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('asset."isErrorPage" = false')
      .getCount();
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  private async countVulnerabilities(workspaceId: string): Promise<number> {
    return this.dataSource
      .getRepository(Vulnerability)
      .createQueryBuilder('vulnerability')
      .innerJoin('vulnerability.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('asset."isErrorPage" = false')
      .getCount();
  }

  /**
   * Retrieves the total count of unique technologies in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  private async countUniqueTechnologies(workspaceId: string): Promise<number> {
    const result = await this.dataSource
      .getRepository(HttpResponse)
      .createQueryBuilder('httpResponse')
      .select('DISTINCT UNNEST(httpResponse.tech)', 'technology')
      .innerJoin('httpResponse.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('asset."isErrorPage" = false')
      .getRawMany();

    return result.length;
  }

  /**
   * Retrieves the total count of unique ports in a workspace directly from the database.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to the total count of unique ports.
   */
  private async countUniquePorts(workspaceId: string): Promise<number> {
    const result = await this.dataSource
      .getRepository(HttpResponse)
      .createQueryBuilder('httpResponse')
      .select('DISTINCT httpResponse.port', 'port')
      .innerJoin('httpResponse.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('httpResponse.port IS NOT NULL')
      .andWhere('asset."isErrorPage" = false')
      .getRawMany();

    return result.length;
  }

  /**
   * Retrieves the total count of targets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of targets.
   */
  async getTotalTargets(query: GetStatisticQueryDto): Promise<number> {
    return this.countTargets(query.workspaceId);
  }

  /**
   * Retrieves the total count of assets in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of assets.
   */
  async getTotalAssets(query: GetStatisticQueryDto): Promise<number> {
    return this.countAssets(query.workspaceId);
  }

  /**
   * Retrieves the total count of vulnerabilities in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of vulnerabilities.
   */
  async getTotalVulnerabilities(query: GetStatisticQueryDto): Promise<number> {
    return this.countVulnerabilities(query.workspaceId);
  }

  /**
   * Retrieves the total count of unique technologies in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique technologies.
   */
  async getTotalUniqueTechnologies(query: GetStatisticQueryDto): Promise<number> {
    return this.countUniqueTechnologies(query.workspaceId);
  }

  /**
   * Retrieves the total count of unique ports in a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to the total count of unique ports.
   */
  async getTotalUniquePorts(query: GetStatisticQueryDto): Promise<number> {
    return this.countUniquePorts(query.workspaceId);
  }

  /**
   * Retrieves all statistics for a workspace.
   *
   * @param query - The query parameters containing workspaceId.
   * @returns A promise that resolves to an object containing all statistics.
   */
  async getStatistics(query: GetStatisticQueryDto): Promise<StatisticResponseDto & { totalUniqueTechnologies: number; totalUniquePorts: number }> {
    const [totalTargets, totalAssets, totalUniqueTechnologies, totalUniquePorts] = await Promise.all([
      this.countTargets(query.workspaceId),
      this.countAssets(query.workspaceId),
      this.countUniqueTechnologies(query.workspaceId),
      this.countUniquePorts(query.workspaceId),
    ]);

    return {
      totalTargets,
      totalAssets,
      totalUniqueTechnologies,
      totalUniquePorts,
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

  /**
   * Retrieves issues timeline statistics for a workspace.
   *
   * @param workspaceId - The ID of the workspace.
   * @returns A promise that resolves to issues timeline statistics.
   */
  async getIssuesTimeline(workspaceId: string): Promise<IssuesTimelineResponseDto> {
    const rawResults: { vuls: number; createdAt: Date }[] = await this.dataSource
      .getRepository(Statistic)
      .createQueryBuilder('workspace_statistics')
      .select('vuls, "createdAt"')
      .where('"workspaceId" = :workspaceId', { workspaceId })
      .andWhere('"createdAt" >= :threeMonthsAgo', { threeMonthsAgo: new Date(new Date().setMonth(new Date().getMonth() - 3)) })
      .getRawMany();

    return {
      data: rawResults,
      total: rawResults.length,
    };
  }

  async getTopTagsAssets(
    workspaceId: string,
  ): Promise<TopTagAsset[]> {
    const rawResults: { tag: string; count: string }[] = await this.dataSource
      .getRepository(AssetTag)
      .createQueryBuilder('asset_tag')
      .select('asset_tag.tag', 'tag')
      .addSelect('COUNT(asset_tag.id)', 'count')
      .innerJoin('asset_tag.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .innerJoin('target.workspaceTargets', 'workspaceTarget')
      .where('workspaceTarget.workspace.id = :workspaceId', { workspaceId })
      .andWhere('asset."isErrorPage" = false')
      .groupBy('asset_tag.tag')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return rawResults.map((result) => ({
      tag: result.tag,
      count: parseInt(result.count, 10),
    }));
  }
}