import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      .where('ws.workspaceId = :workspaceId', { workspaceId })
      .getOne();

    if (!result) {
      return null;
    }
    return result;
  }
}
