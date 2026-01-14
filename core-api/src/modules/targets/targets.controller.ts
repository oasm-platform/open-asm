import { UserContext, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { WorkspaceOwnerGuard } from '@/common/guards/workspace-owner.guard';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  CreateTargetDto,
  GetManyTargetResponseDto,
  GetManyWorkspaceQueryParamsDto,
  UpdateTargetDto,
} from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { TargetsService } from './targets.service';

@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Doc({
    summary: 'Create a target',
    description:
      'Registers a new security testing target such as a domain, IP address, or network range for vulnerability assessment and continuous monitoring.',
    response: {
      serialization: Target,
    },
  })
  @Post()
  createTarget(
    @Body() dto: CreateTargetDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.targetsService.createTarget(dto, userContext);
  }

  @Doc({
    summary: 'Get all targets in a workspace',
    description:
      'Fetches a comprehensive list of all registered security testing targets within the specified workspace for vulnerability management and assessment tracking.',
    response: {
      serialization: GetManyResponseDto(GetManyTargetResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getTargetsInWorkspace(
    @Query() query: GetManyWorkspaceQueryParamsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.targetsService.getTargetsInWorkspace(query, workspaceId);
  }

  @Doc({
    summary: 'Export targets to CSV',
    description:
      'Exports all targets in a workspace to a CSV file containing value, last discovered date, and creation date for reporting and analysis purposes.',
    response: {
      description: 'CSV file containing targets data',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Get('export')
  async exportTargetsToCSV(
    @WorkspaceId() workspaceId: string,
    @Res() res: Response,
  ) {
    // Helper function to format date as DD-MM-YYYY
    const formatDate = (date: Date | null | undefined): string => {
      if (!date) return '';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Get targets data for CSV export
    const targets = await this.targetsService.exportTargetsForCSV(workspaceId);
    // Create CSV content
    const csvRows: string[] = [];
    // Add header row
    csvRows.push('value,lastDiscoveredAt,createdAt');

    // Add data rows
    for (const target of targets) {
      const lastDiscoveredAtFormatted = target.lastDiscoveredAt
        ? formatDate(target.lastDiscoveredAt)
        : '';
      const createdAtFormatted = target.createdAt
        ? formatDate(target.createdAt)
        : '';
      const row = `"${target.value.replace(/"/g, '""')}","${lastDiscoveredAtFormatted}","${createdAtFormatted}"`;
      csvRows.push(row);
    }

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="targets_${workspaceId}.csv"`,
    );
    res.setHeader('Content-Length', Buffer.byteLength(csvRows.join('\n')));

    // Send CSV content
    res.send(csvRows.join('\n'));
  }

  @Doc({
    summary: 'Get a target by ID',
    description:
      'Fetches detailed information about a specific security testing target using its unique identifier, including configuration and assessment status.',
    response: {
      serialization: Target,
    },
    request:{
      getWorkspaceId: true
    }
  })
  @Get(':id')
  getTargetById(@Param() { id }: IdQueryParamDto, @WorkspaceId() workspaceId: string) {
    return this.targetsService.getTargetById(id, workspaceId);
  }

  @Doc({
    summary: 'Delete a target from a workspace',
    description:
      'Removes a security testing target from the specified workspace, terminating all associated monitoring and assessment activities.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':id/workspace/:workspaceId')
  deleteTargetFromWorkspace(
    @Param() { id }: IdQueryParamDto,
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.targetsService.deleteTargetFromWorkspace(
      id,
      workspaceId,
      userContext,
    );
  }

  @Doc({
    summary: 'Rescan a target',
    description:
      'Initiates a comprehensive security re-assessment of the specified target, triggering new vulnerability scans to identify potential security risks.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':id/re-scan')
  reScanTarget(@Param() { id }: IdQueryParamDto) {
    return this.targetsService.assetService.reScan(id);
  }

  @Doc({
    summary: 'Update a target',
    description:
      'Modifies the configuration and properties of an existing security testing target, allowing for dynamic adjustments to assessment parameters.',
    response: {
      serialization: Target,
    },
  })
  @Patch(':id')
  updateTarget(@Param() { id }: IdQueryParamDto, @Body() dto: UpdateTargetDto) {
    return this.targetsService.updateTarget(id, dto);
  }
}
