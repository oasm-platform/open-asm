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
  GenerateReportBodyDto,
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
    summary: 'Generate PDF report',
    description: 'Generates a PDF report with mock data.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post('generate')
  async generateReport(
    @Body() body: GenerateReportBodyDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.reportsService.generateReport(
      workspaceId,
      userId,
      body.type,
    );

    return { message: 'Report generated successfully' };
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
