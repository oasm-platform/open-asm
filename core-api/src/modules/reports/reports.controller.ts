import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import type { NodeResponse } from '@nestjs/platform-node';
import {
  CreateReportScheduleDto,
  GenerateQueryReportBodyDto,
  GenerateSummaryReportBodyDto,
  GenerateVulReportBodyDto,
  GetManyReportsQueryDto,
  PreviewSummaryQueryDto,
  PreviewVulQueryDto,
  ReportDownloadQueryDto,
  ReportDownloadResponseDto,
  ReportResponseDto,
  ReportScheduleResponseDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';
import { AsqErrorInterceptor } from '@/modules/attack-surface-query/asq-error.interceptor';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';

/** Reports run as the member who asks, so they never show more than that member may read. */
function reportScope(workspaceId: string, req: RequestWithMetadata): QueryScope {
  return { workspaceId, permissions: req.permissions ?? [], caller: 'report' };
}

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Doc({
    summary: 'List reports',
    description: 'Returns paginated list of reports for the current workspace.',
    response: {
      serialization: GetManyResponseDto(ReportResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('report.read')
  @Get()
  getMany(
    @Query() query: GetManyReportsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.reportsService.getMany(query, workspaceId);
  }

  @PublishEvent(EVENT_CATALOG.report.exported, { metadata: () => ({ format: 'pdf' }) })
  @WorkspaceAccess('report.read')
  @UseInterceptors(AsqErrorInterceptor)
  @Get('preview/summary')
  async previewSummaryReport(
    @Query() query: PreviewSummaryQueryDto,
    @WorkspaceId() workspaceId: string,
    @Req() req: RequestWithMetadata,
    @Res() res: NodeResponse,
  ) {
    const buffer = await this.reportsService.previewSummaryReport(reportScope(workspaceId, req), {
      startDate: query.startDate,
      endDate: query.endDate,
      targetIds: query.targetIds,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="preview-summary-report.pdf"',
    });
    res.end(buffer);
  }

  @WorkspaceAccess('report.read')
  @UseInterceptors(AsqErrorInterceptor)
  @Get('preview/vulnerability')
  async previewVulReport(
    @Query() query: PreviewVulQueryDto,
    @WorkspaceId() workspaceId: string,
    @Req() req: RequestWithMetadata,
    @Res() res: NodeResponse,
  ) {
    const buffer = await this.reportsService.previewVulnerabilityReport(reportScope(workspaceId, req), {
      startDate: query.startDate,
      endDate: query.endDate,
      targetIds: query.targetIds,
      vulnIds: query.vulnIds,
      minSeverity: query.minSeverity,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="preview-vulnerability-report.pdf"',
    });
    res.end(buffer);
  }

  @Doc({
    summary: 'Generate summary PDF report',
    description: 'Queues a summary (Attack Surface Discovery) PDF report; a notification tells you when it is ready.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.report.generated, { metadata: () => ({ reportType: 'summary' }) })
  @WorkspaceAccess('report.write')
  @UseInterceptors(AsqErrorInterceptor)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('generate/summary')
  async generateSummaryReport(
    @Body() body: GenerateSummaryReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Req() req: RequestWithMetadata,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.enqueueReport(reportScope(workspaceId, req), userId, 'SUMMARY', {
      startDate: body.startDate,
      endDate: body.endDate,
      targetIds: body.targetIds,
    });
    return { message: 'Summary report queued' };
  }

  @Doc({
    summary: 'Generate vulnerability PDF report',
    description: 'Queues a vulnerability assessment PDF report; a notification tells you when it is ready.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('report.write')
  @UseInterceptors(AsqErrorInterceptor)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('generate/vulnerability')
  async generateVulReport(
    @Body() body: GenerateVulReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Req() req: RequestWithMetadata,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.enqueueReport(reportScope(workspaceId, req), userId, 'VULNERABILITY', {
      startDate: body.startDate,
      endDate: body.endDate,
      targetIds: body.targetIds,
      vulnIds: body.vulnIds,
      minSeverity: body.minSeverity,
    });
    return { message: 'Vulnerability report queued' };
  }

  @Doc({
    summary: 'Generate query PDF report',
    description:
      'Queues a saved attack surface query (one table per query) as a PDF report, run with your current permissions.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.report.generated, { metadata: () => ({ reportType: 'query' }) })
  @WorkspaceAccess('report.write')
  @UseInterceptors(AsqErrorInterceptor)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('generate/query')
  async generateQueryReport(
    @Body() body: GenerateQueryReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Req() req: RequestWithMetadata,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.enqueueQueryReport(reportScope(workspaceId, req), userId, body.savedQueryId);
    return { message: 'Query report queued' };
  }

  @Doc({
    summary: 'List report schedules',
    response: { serialization: ReportScheduleResponseDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.read')
  @Get('schedules')
  listSchedules(@WorkspaceId() workspaceId: string) {
    return this.reportsService.listSchedules(workspaceId);
  }

  @Doc({
    summary: 'Create report schedule',
    description: 'Generates the report on a cron (UTC), with your permissions at each run.',
    response: { serialization: ReportScheduleResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.write')
  @UseInterceptors(AsqErrorInterceptor)
  @Post('schedules')
  createSchedule(
    @Body() body: CreateReportScheduleDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Req() req: RequestWithMetadata,
  ) {
    return this.reportsService.createSchedule(reportScope(workspaceId, req), userId, body);
  }

  @Doc({
    summary: 'Delete report schedule',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.write')
  @Delete('schedules/:id')
  async deleteSchedule(
    @Param() params: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.deleteSchedule(params.id, workspaceId);
    return { message: 'Report schedule deleted' };
  }

  @Doc({
    summary: 'Get a report download URL',
    description:
      'Returns a presigned URL for the report PDF: an attachment by default, or `disposition=inline` so the browser displays it.',
    response: { serialization: ReportDownloadResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.read')
  @Get(':id/download')
  getDownloadUrl(
    @Param() params: IdQueryParamDto,
    @Query() query: ReportDownloadQueryDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<ReportDownloadResponseDto> {
    return this.reportsService.getDownloadUrl(params.id, workspaceId, query.disposition ?? 'attachment');
  }

  @Doc({
    summary: 'Delete report',
    description: 'Deletes a generated report PDF.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @PublishEvent(EVENT_CATALOG.report.deleted)
  @WorkspaceAccess('report.write')
  @Delete(':id')
  async deleteReport(
    @Param() params: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.deleteReport(params.id, workspaceId);
    return { message: 'Report deleted successfully' };
  }
}
