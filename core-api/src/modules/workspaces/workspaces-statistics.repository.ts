import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WorkspaceStatisticsResponseDto } from './dto/workspaces.dto';
import { WorkspaceStatisticsView } from './entities/workspace-statistics.view.entity';

@Injectable()
export class WorkspaceStatisticsRepository {
  constructor(
    @InjectRepository(WorkspaceStatisticsView)
    private readonly statisticsViewRepository: Repository<WorkspaceStatisticsView>,
  ) {}

  /**
   * Retrieves workspace statistics by workspace ID.
   * @param workspaceId - The ID of the workspace to retrieve statistics for.
   * @returns The workspace statistics, if found. Otherwise, null.
   */
  public async getStatisticsByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceStatisticsResponseDto | null> {
    const result = await this.statisticsViewRepository
      .createQueryBuilder('ws')
      .where('ws.workspace_id = :workspaceId', { workspaceId })
      .limit(1)
      .getOne();

    if (!result) {
      return null;
    }
    return {
      totalTargets: result.total_targets || 0,
      totalAssets: result.total_assets || 0,
      technologies: result.technologies || [],
      cnameRecords: result.cname_records || [],
      statusCodes: result.status_codes || [],
    };
  }
}
