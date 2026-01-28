import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SecurityReportService } from './security-report.service';
import { CreateReportDto, UpdateReportDto } from './dto/security-report.dto';
import { UserContext } from '@/common/decorators/app.decorator';
import { User } from '../auth/entities/user.entity';
import { Doc } from '@/common/doc/doc.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { SecurityReport } from './entities/security-report.entity';
import { Response } from 'express';

@ApiTags('Security Reports')
@Controller('security-reports')
export class SecurityReportController {
  constructor(private readonly reportService: SecurityReportService) {}

  @Doc({
    summary: 'Create a new security report',
    description: 'Creates a new security report with the provided content.',
    request: {
      getWorkspaceId: true,
    },
    response: {
      serialization: SecurityReport,
    },
  })
  @Post()
  create(
    @Body() createDto: CreateReportDto,
    @UserContext() user: User,
  ): Promise<SecurityReport> {
    return this.reportService.create(createDto, user);
  }

  @Doc({
    summary: 'Preview a security report',
    description:
      'Aggregates data for a security report without saving it to the database.',
    request: {
      getWorkspaceId: true,
    },
    response: {
      serialization: SecurityReport,
    },
  })
  @Post('preview')
  preview(
    @Body() createDto: CreateReportDto,
    @UserContext() user: User,
  ): Promise<SecurityReport> {
    return this.reportService.generatePreview(createDto, user);
  }

  @Doc({
    summary: 'Get all security reports in workspace',
    description:
      'Retrieves a list of all security reports in the current workspace.',
    request: {
      getWorkspaceId: true,
    },
    response: {
      serialization: SecurityReport,
      isArray: true,
    },
  })
  @Get()
  findAll(@WorkspaceId() workspaceId: string): Promise<SecurityReport[]> {
    return this.reportService.findAll(workspaceId);
  }

  @Doc({
    summary: 'Get security report by ID',
    description: 'Retrieves a single security report by its ID.',
    response: {
      serialization: SecurityReport,
    },
  })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<SecurityReport> {
    return this.reportService.findOne(id);
  }

  @ApiOperation({
    summary: 'Download security report as PDF',
    operationId: 'downloadPdf',
    description:
      'Generates and downloads a PDF version of the security report.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    schema: {
      type: 'string',
      format: 'binary',
    },
    description: 'Professional PDF report file',
  })
  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.reportService.generatePdf(id);
    const report = await this.reportService.findOne(id);
    const fileName = `security_report_${report.name.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdf.length,
    });

    res.end(pdf);
  }

  @Doc({
    summary: 'Update security report',
    description: 'Updates an existing security report.',
    response: {
      serialization: SecurityReport,
    },
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateReportDto,
  ): Promise<SecurityReport> {
    return this.reportService.update(id, updateDto);
  }

  @Doc({
    summary: 'Delete security report',
    description: 'Deletes a security report by its ID.',
  })
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.reportService.remove(id);
  }
}
