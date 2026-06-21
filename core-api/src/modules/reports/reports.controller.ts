import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  GenerateSummaryReportBodyDto,
  GenerateVulReportBodyDto,
  GetManyReportsQueryDto,
  PreviewSummaryQueryDto,
  PreviewVulQueryDto,
  ReportResponseDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

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
  @Get()
  getMany(
    @Query() query: GetManyReportsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.reportsService.getMany(query, workspaceId);
  }

  @Get('preview/summary')
  async previewSummaryReport(
    @Query() query: PreviewSummaryQueryDto,
    @WorkspaceId() workspaceId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.previewSummaryReport(workspaceId, {
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

  @Get('preview/vulnerability')
  async previewVulReport(
    @Query() query: PreviewVulQueryDto,
    @WorkspaceId() workspaceId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.previewVulnerabilityReport(workspaceId, {
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
    description: 'Generates a summary (Attack Surface Discovery) PDF report.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('generate/summary')
  async generateSummaryReport(
    @Body() body: GenerateSummaryReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    const options = {
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      targetIds: body.targetIds,
    };

    await this.reportsService.generateReport(
      workspaceId,
      userId,
      'SUMMARY',
      options,
    );

    return { message: 'Summary report generated successfully' };
  }

  @Doc({
    summary: 'Generate vulnerability PDF report',
    description: 'Generates a vulnerability assessment PDF report.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('generate/vulnerability')
  async generateVulReport(
    @Body() body: GenerateVulReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    const options = {
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      targetIds: body.targetIds,
      vulnIds: body.vulnIds,
      minSeverity: body.minSeverity,
    };

    await this.reportsService.generateReport(
      workspaceId,
      userId,
      'VULNERABILITY',
      options,
    );

    return { message: 'Vulnerability report generated successfully' };
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
  @Delete(':id')
  async deleteReport(
    @Param() params: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.deleteReport(params.id, workspaceId);
    return { message: 'Report deleted successfully' };
  }
}
