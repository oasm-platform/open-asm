import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Post, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Doc({
    summary: 'Test render HTML',
    description: 'Renders HTML template with mock data for debugging.',
  })
  @Get('test')
  async testRender(@Res() res: Response): Promise<void> {
    const html = await this.reportsService.renderHtmlOnly();

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Doc({
    summary: 'Generate PDF report',
    description: 'Generates a PDF report with mock data and returns the file.',
  })
  @Post('generate')
  async generateReport(@Res() res: Response): Promise<void> {
    const filePath = await this.reportsService.generateReport();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');

    res.sendFile(filePath);
  }
}