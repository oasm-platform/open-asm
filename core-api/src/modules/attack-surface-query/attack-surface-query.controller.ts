import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import type { RequestWithMetadata, UserContextPayload } from '@/common/interfaces/app.interface';

import { AsqErrorInterceptor } from './asq-error.interceptor';
import { AsqSavedQueriesService } from './asq-saved-queries.service';
import { AttackSurfaceQueryService } from './attack-surface-query.service';
import { AsqError } from './domain/query-errors';
import type { QueryScope } from './domain/query.types';
import {
  CreateSavedQueryDto,
  ExplainResultDto,
  QueryBatchDto,
  QueryBatchResultDto,
  ReportJobDto,
  RunSavedQueryDto,
  SavedQueryDto,
  SchemaResponseDto,
  UpdateSavedQueryDto,
} from './dto/attack-surface-query.dto';

/** Largest query body accepted (the batch, serialized). */
export const MAX_QUERY_BODY_BYTES = 64 * 1024;

const idParam = [{ name: 'id', type: String, description: 'Saved query ID' }];
const jobParam = [{ name: 'jobId', type: String, description: 'Report job ID' }];

/**
 * Attack surface queries over HTTP. Every route needs workspace membership;
 * the service then checks the permission of every resource a query reads
 * (asset.read, vulnerability.read, target.read), so the guard only requires
 * membership here.
 */
@ApiTags('Attack Surface Query')
@UseInterceptors(AsqErrorInterceptor)
@Controller('attack-surface')
export class AttackSurfaceQueryController {
  constructor(
    private readonly attackSurfaceQuery: AttackSurfaceQueryService,
    private readonly savedQueries: AsqSavedQueriesService,
  ) {}

  private scope(req: RequestWithMetadata, workspaceId: string): QueryScope {
    return { workspaceId, permissions: req.permissions ?? [], caller: 'http' };
  }

  private assertBodySize(body: unknown): void {
    if (Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8') > MAX_QUERY_BODY_BYTES) {
      throw new AsqError('INVALID_QUERY', `The query is larger than ${MAX_QUERY_BODY_BYTES} bytes`);
    }
  }

  @Doc({
    summary: 'Attack surface query schema',
    description: 'Resources, fields, operators and relations the caller may query.',
    response: { serialization: SchemaResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess()
  @Get('schema')
  schema(@Req() req: RequestWithMetadata, @WorkspaceId() workspaceId: string): SchemaResponseDto {
    return { resources: this.attackSurfaceQuery.describe(this.scope(req, workspaceId)) as SchemaResponseDto['resources'] };
  }

  @Doc({
    summary: 'Run attack surface queries',
    description:
      'Runs a batch of named queries. With options.mode = "report" the batch is queued and the response is a job to poll (GET attack-surface/jobs/:jobId).',
    response: { serialization: QueryBatchResultDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess()
  @HttpCode(200)
  @Post('query')
  async query(
    @Req() req: RequestWithMetadata,
    @WorkspaceId() workspaceId: string,
    @Body() body: QueryBatchDto,
  ) {
    this.assertBodySize(body);
    return this.attackSurfaceQuery.run(this.scope(req, workspaceId), { ...body });
  }

  @Doc({
    summary: 'Explain attack surface queries',
    description: 'Validates a batch and returns its cost and planner estimates without running it.',
    response: { serialization: ExplainResultDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess()
  @HttpCode(200)
  @Post('explain')
  explain(
    @Req() req: RequestWithMetadata,
    @WorkspaceId() workspaceId: string,
    @Body() body: QueryBatchDto,
  ) {
    this.assertBodySize(body);
    return this.attackSurfaceQuery.explain(
      this.scope(req, workspaceId),
      { ...body },
      process.env.NODE_ENV === 'development',
    );
  }

  @Doc({
    summary: 'Report job state',
    description: 'State and, once completed, result of a report-mode query batch (kept one hour).',
    response: { serialization: ReportJobDto },
    request: { getWorkspaceId: true, params: jobParam },
  })
  @WorkspaceAccess()
  @Get('jobs/:jobId')
  job(@WorkspaceId() workspaceId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.attackSurfaceQuery.getReport(workspaceId, jobId);
  }

  @Doc({
    summary: 'List saved queries',
    response: { serialization: SavedQueryDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.read')
  @Get('saved-queries')
  listSaved(@WorkspaceId() workspaceId: string) {
    return this.savedQueries.list(workspaceId);
  }

  @Doc({
    summary: 'Save a query',
    description: 'Saves a named query batch; the batch is validated against the catalog and your permissions.',
    response: { serialization: SavedQueryDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('report.write')
  @Post('saved-queries')
  createSaved(
    @Req() req: RequestWithMetadata,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
    @Body() dto: CreateSavedQueryDto,
  ) {
    this.assertBodySize(dto.spec);
    return this.savedQueries.create(this.scope(req, workspaceId), user.id, dto);
  }

  @Doc({
    summary: 'Get a saved query',
    response: { serialization: SavedQueryDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('report.read')
  @Get('saved-queries/:id')
  getSaved(@WorkspaceId() workspaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.savedQueries.get(workspaceId, id);
  }

  @Doc({
    summary: 'Update a saved query',
    response: { serialization: SavedQueryDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('report.write')
  @Patch('saved-queries/:id')
  updateSaved(
    @Req() req: RequestWithMetadata,
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedQueryDto,
  ) {
    if (dto.spec) this.assertBodySize(dto.spec);
    return this.savedQueries.update(this.scope(req, workspaceId), id, dto);
  }

  @Doc({
    summary: 'Delete a saved query',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('report.write')
  @Delete('saved-queries/:id')
  async deleteSaved(@WorkspaceId() workspaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.savedQueries.remove(workspaceId, id);
    return { message: 'Saved query deleted' };
  }

  @Doc({
    summary: 'Run a saved query',
    description: 'Runs a saved batch with your current permissions; params the batch declares can be set in the body.',
    response: { serialization: QueryBatchResultDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('report.read')
  @HttpCode(200)
  @Post('saved-queries/:id/run')
  runSaved(
    @Req() req: RequestWithMetadata,
    @WorkspaceId() workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunSavedQueryDto,
  ) {
    // No body (older clients) runs with the defaults.
    this.assertBodySize(dto?.params);
    return this.savedQueries.run(this.scope(req, workspaceId), id, dto?.params ?? {});
  }
}
