import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { UserId } from '@/common/decorators/app.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ProjectChange } from '@/common/enums/enum';
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
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Asset } from '../assets/entities/assets.entity';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { GetProjectsQueryDto, ProjectListItemDto } from './dto/get-projects.dto';
import {
  GetProjectAssetsQueryDto,
  ProjectAssetDto,
  ProjectAssetIdsDto,
  ProjectAssetsChangedDto,
} from './dto/project-assets.dto';
import {
  GetProjectRunsQueryDto,
  GetProjectVulnerabilitiesQueryDto,
  ProjectOverviewDto,
  ProjectRunDto,
  ProjectVulnerabilitiesResponseDto,
  VulnerabilityTimelineDto,
} from './dto/project-results.dto';
import {
  ProjectScopeDto,
  ReplaceScopeRulesDto,
  ScopePreviewDto,
  ScopePreviewResultDto,
  ScopeSyncResultDto,
} from './dto/project-scope.dto';
import {
  CreateProjectTriggerDto,
  UpdateProjectTriggerDto,
} from './dto/project-trigger.dto';
import {
  CreateProjectWorkflowDto,
  ProjectWorkflowRemovedDto,
  RunProjectWorkflowDto,
  RunStartedDto,
  UpdateProjectWorkflowDto,
  WorkflowTemplateDto,
} from './dto/project-workflow.dto';
import {
  PresignProjectFileDto,
  PresignProjectFileResponseDto,
  ProjectFileDto,
} from './dto/project-files.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { ProjectFilesService } from './project-files.service';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import { ProjectWorkflowTrigger } from './entities/project-workflow-trigger.entity';
import { ProjectAssetsService } from './project-assets.service';
import { ProjectResultsService } from './project-results.service';
import { ProjectScopeService } from './project-scope.service';
import { ProjectTriggersService } from './project-triggers.service';
import { ProjectWorkflowsService } from './project-workflows.service';
import { ProjectsService } from './projects.service';

const withWorkspace = { getWorkspaceId: true } as const;

type EventMetadata = Record<string, string | number | boolean | string[]>;

/**
 * Every change to a project's settings, scope, workflows or triggers, with
 * `metadata.change` saying which (and what it touched) for its activity.
 */
const PROJECT_UPDATED = (
  change: ProjectChange,
  details?: (result: unknown) => EventMetadata,
) =>
  PublishEvent(EVENT_CATALOG.project.updated, {
    resourceIdFromRoute: true,
    metadata: (_body, result) => ({
      change,
      ...(result ? details?.(result) : undefined),
    }),
  });

const assetsAdded = (result: unknown) => ({
  added: (result as ProjectAssetsChangedDto).count,
});
const assetsRemoved = (result: unknown) => ({
  removed: (result as ProjectAssetsChangedDto).count,
});
const workflowName = (result: unknown) => ({
  workflow: (result as ProjectWorkflow).workflow?.name ?? '',
});

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly assetsService: ProjectAssetsService,
    private readonly scopeService: ProjectScopeService,
    private readonly workflowsService: ProjectWorkflowsService,
    private readonly triggersService: ProjectTriggersService,
    private readonly resultsService: ProjectResultsService,
    private readonly filesService: ProjectFilesService,
  ) {}

  // ─── Projects ───────────────────────────────────────────────────────────

  @Doc({
    summary: 'List projects',
    description:
      'Project cards: assets, workflows, open vulnerabilities by severity, last run and triggers.',
    response: { serialization: GetManyResponseDto(ProjectListItemDto) },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get()
  getMany(
    @Query() query: GetProjectsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.getMany(query, workspaceId);
  }

  @Doc({
    summary: 'Create project',
    description:
      'Creates a project with its hand-picked assets, scope rules, pipeline and triggers in one request.',
    response: { serialization: Project },
    request: withWorkspace,
  })
  @PublishEvent(EVENT_CATALOG.project.created, {
    resourceId: (result) => (result as Project | undefined)?.id,
    changes: (body) => ({
      name: { after: (body as { name?: string })?.name ?? '' },
    }),
    // The assets it starts with, for the project's activity.
    metadata: (_body, result) => ({
      added: (result as Project | undefined)?.totalAssets ?? 0,
    }),
  })
  @WorkspaceAccess('project.write')
  @Post()
  create(@Body() dto: CreateProjectDto, @WorkspaceId() workspaceId: string) {
    return this.projectsService.create(dto, workspaceId);
  }

  @Doc({
    summary: 'Workflow templates',
    description: 'Default workflows a project pipeline can start from.',
    response: { serialization: WorkflowTemplateDto, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get('workflow-templates')
  getWorkflowTemplates(@WorkspaceId() workspaceId: string) {
    return this.workflowsService.listTemplates(workspaceId);
  }

  @Doc({
    summary: 'Preview scope rules',
    description:
      'Counts the assets a rule set would select, without saving it.',
    response: { serialization: ScopePreviewResultDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Post('scope-preview')
  previewScope(
    @Body() dto: ScopePreviewDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.scopeService.preview(workspaceId, dto.rules, dto.projectId);
  }

  @Doc({
    summary: 'Get project',
    description: 'A project with its workflows, their triggers and last run.',
    response: { serialization: Project },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @WorkspaceId() workspaceId: string) {
    return this.projectsService.getById(id, workspaceId);
  }

  @Doc({
    summary: 'Update project',
    description: 'Name, color, description and whether rules add new assets.',
    response: { serialization: Project },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.SETTINGS)
  @WorkspaceAccess('project.write')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.update(id, dto, workspaceId);
  }

  @Doc({
    summary: 'Delete project',
    description:
      'Deletes the project and the workflows it owns (their runs go with them). Vulnerabilities stay in the workspace.',
    response: { serialization: DefaultMessageResponseDto },
    request: withWorkspace,
  })
  @PublishEvent(EVENT_CATALOG.project.deleted, { resourceIdFromRoute: true })
  @WorkspaceAccess('project.write')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @WorkspaceId() workspaceId: string) {
    return this.projectsService.delete(id, workspaceId);
  }

  @Doc({
    summary: 'Archive project',
    description:
      'Stops every schedule and event trigger and makes the project read-only.',
    response: { serialization: Project },
    request: withWorkspace,
  })
  @PublishEvent(EVENT_CATALOG.project.archived, { resourceIdFromRoute: true })
  @WorkspaceAccess('project.write')
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @WorkspaceId() workspaceId: string) {
    return this.projectsService.archive(id, workspaceId);
  }

  @Doc({
    summary: 'Reopen project',
    description: 'Reopens an archived project and re-registers its schedules.',
    response: { serialization: Project },
    request: withWorkspace,
  })
  @PublishEvent(EVENT_CATALOG.project.unarchived, { resourceIdFromRoute: true })
  @WorkspaceAccess('project.write')
  @Post(':id/unarchive')
  unarchive(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.unarchive(id, workspaceId);
  }

  @Doc({
    summary: 'Project overview',
    description:
      'Asset and vulnerability counts, weekly new vulnerabilities, last run and recent activity.',
    response: { serialization: ProjectOverviewDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/overview')
  getOverview(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.resultsService.overview(id, workspaceId);
  }

  // ─── Scope ──────────────────────────────────────────────────────────────

  @Doc({
    summary: 'Project assets',
    description:
      'Assets with their source (hand-picked or rule), open vulnerabilities and last scan.',
    response: { serialization: GetManyResponseDto(ProjectAssetDto) },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/assets')
  getAssets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetProjectAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.list(id, workspaceId, query);
  }

  @Doc({
    summary: 'Asset candidates',
    description: 'Assets of the workspace that are not in the project.',
    response: { serialization: GetManyResponseDto(Asset) },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/assets/candidates')
  getAssetCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.candidates(id, workspaceId, query);
  }

  @Doc({
    summary: 'Add assets',
    description:
      'Adds assets by hand; "assets added" triggers pick up the new ones.',
    response: { serialization: ProjectAssetsChangedDto },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.ASSETS_ADDED, assetsAdded)
  @WorkspaceAccess('project.write')
  @Post(':id/assets')
  addAssets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectAssetIdsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.addAssets(id, workspaceId, dto.assetIds);
  }

  @Doc({
    summary: 'Remove assets',
    description:
      'Removes assets; one a rule still selects gets an exclude rule so it stays out.',
    response: { serialization: ProjectAssetsChangedDto },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.ASSETS_REMOVED, assetsRemoved)
  @WorkspaceAccess('project.write')
  @Delete(':id/assets')
  removeAssets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectAssetIdsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.removeAssets(id, workspaceId, dto.assetIds);
  }

  @Doc({
    summary: 'Scope rules',
    description: 'Include and exclude rules with what each matches.',
    response: { serialization: ProjectScopeDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/scope-rules')
  getScopeRules(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.scopeService.getScope(id, workspaceId);
  }

  @Doc({
    summary: 'Replace scope rules',
    description:
      'Saves the rule set and syncs the assets the rules add or no longer select.',
    response: { serialization: ScopeSyncResultDto },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.SCOPE, (result) => {
    const { added, removed } = result as ScopeSyncResultDto;
    return { added, removed };
  })
  @WorkspaceAccess('project.write')
  @Put(':id/scope-rules')
  replaceScopeRules(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceScopeRulesDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.replaceScope(
      id,
      workspaceId,
      dto.rules,
      dto.autoAddAssets,
    );
  }

  // ─── Workflows ──────────────────────────────────────────────────────────

  @Doc({
    summary: 'Project workflows',
    description: 'Workflows of the project with their triggers and last run.',
    response: { serialization: ProjectWorkflow, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/workflows')
  getWorkflows(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.workflowsService.list(id, workspaceId);
  }

  @Doc({
    summary: 'Add workflow',
    description:
      'Creates a project-owned workflow from tools, a default template or a copy of another project workflow.',
    response: { serialization: ProjectWorkflow },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.WORKFLOW_ADDED, workflowName)
  @WorkspaceAccess('project.write')
  @Post(':id/workflows')
  createWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProjectWorkflowDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.addWorkflow(id, workspaceId, dto);
  }

  @Doc({
    summary: 'Update workflow',
    description:
      'Renames a project workflow, replaces its pipeline and/or when it runs (on).',
    response: { serialization: ProjectWorkflow },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.WORKFLOW_UPDATED, workflowName)
  @WorkspaceAccess('project.write')
  @Patch(':id/workflows/:bindingId')
  updateWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @Body() dto: UpdateProjectWorkflowDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.updateWorkflow(id, workspaceId, bindingId, dto);
  }

  @Doc({
    summary: 'Remove workflow',
    description:
      'Deletes a project workflow with its triggers and runs.',
    response: { serialization: ProjectWorkflowRemovedDto },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.WORKFLOW_REMOVED, (result) => ({
    workflow: (result as ProjectWorkflowRemovedDto).name,
  }))
  @WorkspaceAccess('project.write')
  @Delete(':id/workflows/:bindingId')
  removeWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.removeWorkflow(id, workspaceId, bindingId);
  }

  @Doc({
    summary: 'Run workflow',
    description:
      'Starts a manual run on the whole scope or on the given project assets.',
    response: { serialization: RunStartedDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.write')
  @Post(':id/workflows/:bindingId/run')
  runWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bindingId', ParseUUIDPipe) bindingId: string,
    @Body() dto: RunProjectWorkflowDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.projectsService.runWorkflow(
      id,
      workspaceId,
      bindingId,
      dto.assetIds,
    );
  }

  // ─── Triggers ───────────────────────────────────────────────────────────

  @Doc({
    summary: 'Project triggers',
    description: 'Cron and event triggers of every workflow.',
    response: { serialization: ProjectWorkflowTrigger, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/triggers')
  getTriggers(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.triggersService.list(id, workspaceId);
  }

  @Doc({
    summary: 'Add trigger',
    description: 'Runs a workflow on a cron schedule or when assets are added.',
    response: { serialization: ProjectWorkflowTrigger },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.TRIGGERS)
  @WorkspaceAccess('project.write')
  @Post(':id/triggers')
  createTrigger(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProjectTriggerDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.triggersService.create(id, workspaceId, dto);
  }

  @Doc({
    summary: 'Update trigger',
    description: 'Changes a schedule or settings, or turns a trigger on or off.',
    response: { serialization: ProjectWorkflowTrigger },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.TRIGGERS)
  @WorkspaceAccess('project.write')
  @Patch(':id/triggers/:triggerId')
  updateTrigger(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @Body() dto: UpdateProjectTriggerDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.triggersService.update(id, workspaceId, triggerId, dto);
  }

  @Doc({
    summary: 'Remove trigger',
    response: { serialization: DefaultMessageResponseDto },
    request: withWorkspace,
  })
  @PROJECT_UPDATED(ProjectChange.TRIGGERS)
  @WorkspaceAccess('project.write')
  @Delete(':id/triggers/:triggerId')
  async removeTrigger(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('triggerId', ParseUUIDPipe) triggerId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.triggersService.remove(id, workspaceId, triggerId);
    return { message: 'Trigger removed' };
  }

  // ─── Results ────────────────────────────────────────────────────────────

  @Doc({
    summary: 'Project runs',
    description:
      'Runs of the project, newest first, with steps and the vulnerabilities each found.',
    response: { serialization: GetManyResponseDto(ProjectRunDto) },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/runs')
  getRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetProjectRunsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.resultsService.runs(id, workspaceId, query);
  }

  @Doc({
    summary: 'Project vulnerabilities',
    description:
      'Vulnerabilities the project found, with provenance (new, recurring, not seen) computed against each one’s reference run.',
    response: { serialization: ProjectVulnerabilitiesResponseDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/vulnerabilities')
  getVulnerabilities(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetProjectVulnerabilitiesQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.resultsService.vulnerabilities(id, workspaceId, query);
  }

  @Doc({
    summary: 'Vulnerability timeline',
    description:
      'Project runs that scanned the asset with the reporting tool, marked seen or missed.',
    response: { serialization: VulnerabilityTimelineDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/vulnerabilities/:vulnerabilityId/timeline')
  getVulnerabilityTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vulnerabilityId', ParseUUIDPipe) vulnerabilityId: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.resultsService.timeline(id, workspaceId, vulnerabilityId);
  }

  // ─── Files ──────────────────────────────────────────────────────────────

  @Doc({
    summary: 'Project files',
    description: 'Files a chat about the project reads as context (at most 5).',
    response: { serialization: ProjectFileDto, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.read')
  @Get(':id/files')
  getFiles(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.filesService.list(id, workspaceId);
  }

  @Doc({
    summary: 'Start a file upload',
    description:
      'Reserves workspace storage for a .md, .txt or .csv file (10 MB max) and returns the form to POST it to; finish with the complete call.',
    response: { serialization: PresignProjectFileResponseDto },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.write')
  @Post(':id/files/presign')
  presignFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PresignProjectFileDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.filesService.presign(id, workspaceId, userId, dto);
  }

  @Doc({
    summary: 'Finish a file upload',
    description: 'Checks the uploaded object and attaches it to the project.',
    response: { serialization: ProjectFileDto, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.write')
  @Post(':id/files/:artifactId/complete')
  completeFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    return this.filesService.complete(id, workspaceId, userId, artifactId);
  }

  @Doc({
    summary: 'Detach a file',
    description: 'Removes the file from the project; it stays in the workspace Files.',
    response: { serialization: ProjectFileDto, isArray: true },
    request: withWorkspace,
  })
  @WorkspaceAccess('project.write')
  @Delete(':id/files/:artifactId')
  removeFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('artifactId', ParseUUIDPipe) artifactId: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.filesService.remove(id, workspaceId, artifactId);
  }
}
