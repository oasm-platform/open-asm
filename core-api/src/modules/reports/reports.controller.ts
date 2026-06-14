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
import { Response } from 'express';
import {
  GenerateSummaryReportBodyDto,
  GenerateVulnerabilityReportBodyDto,
  GetManyReportsQueryDto,
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

  @Doc({
    summary: 'Test render HTML',
    description: 'Renders HTML template with mock data for debugging.',
  })
  @Get('test')
  testRender(@Res() res: Response): void {
    const html = this.reportsService.renderHtmlOnly();

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Doc({
    summary: 'Generate summary report',
    description: 'Generates a summary PDF report with mock data.',
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
    summary: 'Generate vulnerability report',
    description: 'Generates a vulnerability PDF report with mock data.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('generate/vulnerability')
  async generateVulnerabilityReport(
    @Body() body: GenerateVulnerabilityReportBodyDto,
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
