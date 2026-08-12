import { UserContext, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import {
  RequestWithMetadata,
  UserContextPayload,
} from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { AuditLog } from '../audit/audit-log.decorator';
import { AuditService } from '../audit/audit.service';
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
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  BulkTargetResultDto,
  CreateMultipleTargetsDto,
  GetManyTargetResponseDto,
  GetManyWorkspaceQueryParamsDto,
  UpdateTargetDto,
} from './dto/targets.dto';
import { Target } from './entities/target.entity';
import { TargetsService } from './targets.service';

@Controller('targets')
export class TargetsController {
  constructor(
    private readonly targetsService: TargetsService,
    private readonly auditService: AuditService,
  ) {}

  @Doc({
    summary: 'Create multiple targets in bulk',
    description:
      'Creates multiple security testing targets in a single request, skipping any duplicates that already exist in the workspace. Supports both DOMAIN (root domain) and CIDR (/24 range only) types. Returns detailed results including created targets and skipped values.',
    response: {
      serialization: BulkTargetResultDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @AuditLog('target.created', {
    // Best-effort changes from the body — record the requested target values,
    // never echo back the full created entities.
    changes: (body) => {
      const dto = body as CreateMultipleTargetsDto | undefined;
      const changes: Record<string, { after?: unknown }> = {};
      if (dto?.targets && dto.targets.length > 0) {
        changes.targets = { after: dto.targets.map((t) => t.value) };
      }
      return changes;
    },
  })
  @WorkspaceAccess('target.write')
  @Post('bulk')
  createMultipleTargets(
    @Body() dto: CreateMultipleTargetsDto,
    @UserContext() userContext: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.targetsService.createMultipleTargets(
      dto,
      workspaceId,
      userContext,
    );
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
  @WorkspaceAccess('target.read')
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
      'Exports all targets in a workspace to a CSV file containing value, type (DOMAIN or CIDR), last discovered date, and creation date for reporting and analysis purposes.',
    response: {
      description: 'CSV file containing targets data',
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('target.read')
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
    csvRows.push('value,type,lastDiscoveredAt,createdAt');

    // Add data rows
    for (const target of targets) {
      const lastDiscoveredAtFormatted = target.lastDiscoveredAt
        ? formatDate(target.lastDiscoveredAt)
        : '';
      const createdAtFormatted = target.createdAt
        ? formatDate(target.createdAt)
        : '';
      const row = `"${target.value.replace(/"/g, '""')}","${target.type}","${lastDiscoveredAtFormatted}","${createdAtFormatted}"`;
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
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('target.read')
  @Get(':id')
  getTargetById(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.targetsService.getTargetById(id, workspaceId);
  }

  @Doc({
    summary: 'Delete a target permanently',
    description:
      'Permanently deletes a security testing target and all its associated data (assets, vulnerabilities, jobs, and related records) from the specified workspace.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  // target.deleted is written explicitly in TargetsService.deleteTarget (the
  // interceptor cannot see the deleted entity), with the actor context built
  // here from the request — see AuditService.buildActorContext.
  @WorkspaceAccess('target.write')
  @Delete(':id/workspace/:workspaceId')
  deleteTarget(
    @Param() { id }: IdQueryParamDto,
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @UserContext() userContext: UserContextPayload,
    @Req() req: RequestWithMetadata,
  ) {
    return this.targetsService.deleteTarget(
      id,
      workspaceId,
      userContext,
      this.auditService.buildActorContext(req),
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
  @WorkspaceAccess('target.write')
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
  @AuditLog('target.updated', {
    // Best-effort changes from the body — only fields present in the request.
    changes: (body) => {
      const dto = body as UpdateTargetDto | undefined;
      const changes: Record<string, { after?: unknown }> = {};
      if (dto?.scanSchedule !== undefined) {
        changes.scanSchedule = { after: dto.scanSchedule };
      }
      return changes;
    },
  })
  @WorkspaceAccess('target.write')
  @Patch(':id')
  updateTarget(@Param() { id }: IdQueryParamDto, @Body() dto: UpdateTargetDto) {
    return this.targetsService.updateTarget(id, dto);
  }
}
