import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { GetStatisticQueryDto, StatisticResponseDto } from './dto/statistic.dto';
import { IssuesTimelineResponseDto } from './dto/issues-timeline.dto';
import { TimelineResponseDto } from './dto/timeline.dto';
import { TopTagAsset } from './dto/top-tags-assets.dto';
import { StatisticService } from './statistic.service';

@ApiTags('Statistic')
@Controller('statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) { }

  @Doc({
    summary: 'Get workspace statistics',
    description: 'Retrieves statistics for a workspace including total targets, assets, vulnerabilities, and unique technologies.',
    response: {
      serialization: StatisticResponseDto,
    },
  })
  @Get()
  getStatistics(@Query() query: GetStatisticQueryDto): Promise<Omit<StatisticResponseDto, 'totalVulnerabilities'> & { totalUniqueTechnologies: number; totalUniquePorts: number }> {
    return this.statisticService.getStatistics(query);
  }

  @Doc({
    summary: 'Get timeline statistics for a workspace',
    description: 'Retrieves statistics for a workspace over the last 3 months, showing trends and changes over time.',
    response: {
      serialization: TimelineResponseDto,
    },
    request: {
      getWorkspaceId: true
    }
  })
  @Get('timeline')
  getTimelineStatistics(@WorkspaceId() workspaceId: string): Promise<TimelineResponseDto> {
    return this.statisticService.getTimelineStatistics(workspaceId);
  }

  @Doc({
    summary: 'Get issues timeline statistics for a workspace',
    description: 'Retrieves issues timeline statistics for a workspace, showing the number of vulnerabilities over time.',
    response: {
      serialization: IssuesTimelineResponseDto,
    },
    request: {
      getWorkspaceId: true
    }
  })
  @Get('issues-timeline')
  getIssuesTimeline(@WorkspaceId() workspaceId: string): Promise<IssuesTimelineResponseDto> {
    return this.statisticService.getIssuesTimeline(workspaceId);
  }

  @Doc({
    summary: 'Get top 10 tags with the most assets in a workspace',
    description: 'Retrieves the top 10 tags with the most assets in a workspace.',
    response: {
      extraModels: [TopTagAsset],
      dataSchema: {
        type: 'array',
        items: { $ref: getSchemaPath(TopTagAsset) },
      }
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('top-tags-assets')
  getTopTagsAssets(
    @WorkspaceId() workspaceId: string,
  ): Promise<TopTagAsset[]> {
    return this.statisticService.getTopTagsAssets(workspaceId);
  }
}