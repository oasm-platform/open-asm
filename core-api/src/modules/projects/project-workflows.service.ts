import { JobRunType, WorkerType } from '@/common/enums/enum';
import { WorkspaceEncryptionService } from '@/services/workspace-encryption/workspace-encryption.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import { Tool } from '../tools/entities/tools.entity';
import { resolveToolCategory } from '../tools/tool-categories';
import { resolveStepInputs } from '../tools/tool-io';
import { ToolsService } from '../tools/tools.service';
import {
  encryptInlineConfig,
  getSensitiveFields,
  isMaskedValue,
} from '../tools/validators/tool-config-profiles.crypto';
import {
  Workflow,
  type WorkflowContent,
  type WorkflowJob,
} from '../workflows/entities/workflow.entity';
import {
  buildWorkflowGraph,
  jobEntries,
  normalizeWorkflowContent,
  WorkflowGraphError,
} from '../workflows/workflow-graph';
import { WorkflowsService } from '../workflows/workflows.service';
import type { ProjectToolInput } from './dto/create-project.dto';
import type { ProjectLastRunDto } from './dto/project-last-run.dto';
import type {
  CreateProjectWorkflowDto,
  RunStartedDto,
  UpdateProjectWorkflowDto,
  WorkflowTemplateDto,
} from './dto/project-workflow.dto';
import { Project } from './entities/project.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import { findProjectOrFail } from './project-access';
import {
  buildPipelineJobs,
  isProjectOwnedWorkflow,
  type PipelineStep,
} from './pipeline';
import { RUN_STATUS_SQL } from './provenance';

export interface StartBindingRunOptions {
  jobRunType: JobRunType;
  /** Restrict the run to these project assets; omitted = the whole scope. */
  assetIds?: string[];
  triggerId?: string;
  /** The run whose event started this one, and its hop count. */
  causedByRunId?: string;
  chainDepth?: number;
}

/**
 * The workflows of a project. Each one is owned by the project — created for
 * it (from tools, a default template or a copy), edited from it and deleted
 * with it — and runs on the project's assets only.
 */
@Injectable()
export class ProjectWorkflowsService {
  private readonly logger = new Logger(ProjectWorkflowsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectWorkflow)
    private readonly bindingRepo: Repository<ProjectWorkflow>,
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    private readonly dataSource: DataSource,
    private readonly toolsService: ToolsService,
    private readonly workflowRunnerService: WorkflowRunnerService,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly encryptionService: WorkspaceEncryptionService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  /** Default workflows of the workspace a project pipeline can start from. */
  async listTemplates(workspaceId: string): Promise<WorkflowTemplateDto[]> {
    const workflows = await this.workflowRepo.find({
      where: { workspace: { id: workspaceId }, isCanEdit: false },
      order: { name: 'ASC' },
    });
    return workflows.map((workflow) => ({
      filePath: workflow.filePath,
      name: workflow.name,
      jobs: jobEntries(workflow.content?.jobs).map(([id, job]) => ({
        id,
        run: job.run,
        needs: [job.needs ?? []].flat(),
      })),
    }));
  }

  /** The project's workflows with their triggers and latest run. */
  async list(projectId: string, workspaceId: string): Promise<ProjectWorkflow[]> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId);
    const bindings = await this.bindingRepo.find({
      where: { projectId },
      relations: { workflow: true, triggers: true },
      order: { createdAt: 'ASC', triggers: { createdAt: 'ASC' } },
    });
    const lastRuns = await this.getLastRunForBindings(
      bindings.map((binding) => binding.id),
    );
    for (const binding of bindings) {
      binding.lastRun = lastRuns.get(binding.id) ?? null;
    }
    return bindings;
  }

  /**
   * Latest run per binding. Keyed by `projectWorkflowId`, so a workflow bound
   * to two projects never shows the other project's run.
   */
  async getLastRunForBindings(
    bindingIds: string[],
  ): Promise<Map<string, ProjectLastRunDto>> {
    if (bindingIds.length === 0) return new Map();
    const rows: Array<
      ProjectLastRunDto & { projectWorkflowId: string; totalJobs: number }
    > = await this.dataSource.query(
      `SELECT DISTINCT ON (jh."projectWorkflowId")
              jh."projectWorkflowId", jh.id, jh."createdAt", jh."updatedAt",
              jh."jobHistoryName", jh."jobRunType", w.name AS "workflowName",
              tr.event AS "triggerEvent",
              (SELECT COUNT(*)::int FROM jobs WHERE "jobHistoryId" = jh.id) AS "totalJobs",
              ${RUN_STATUS_SQL} AS status
         FROM job_histories jh
         LEFT JOIN workflows w ON w.id = jh."workflowId"
         LEFT JOIN project_workflow_triggers tr ON tr.id = jh."triggerId"
        WHERE jh."projectWorkflowId" = ANY($1::uuid[])
        ORDER BY jh."projectWorkflowId", jh."createdAt" DESC`,
      [bindingIds],
    );
    const byBinding = new Map<string, ProjectLastRunDto>();
    for (const { projectWorkflowId, ...row } of rows) {
      // A run with no job rows left reads as "pending" forever; it is not a
      // meaningful last run, so the binding falls back to "never".
      if (row.totalJobs === 0) continue;
      byBinding.set(projectWorkflowId, { ...row, status: row.status });
    }
    return byBinding;
  }

  /**
   * Creates a project-owned workflow from exactly one source and binds it.
   * Runs inside `manager` when given, so project creation can roll back.
   */
  async create(
    projectId: string,
    workspaceId: string,
    dto: CreateProjectWorkflowDto,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ProjectWorkflow> {
    const project = await findProjectOrFail(
      manager.getRepository(Project),
      projectId,
      workspaceId,
      { writable: true },
    );
    const sources = [
      dto.tools?.length ? 'tools' : null,
      dto.template ? 'template' : null,
      dto.copyFromProjectWorkflowId ? 'copy' : null,
    ].filter(Boolean);
    if (sources.length !== 1) {
      throw new BadRequestException(
        'Give exactly one of tools, template or copyFromProjectWorkflowId',
      );
    }

    let jobs: Record<string, WorkflowJob>;
    let defaultName: string;
    if (dto.tools?.length) {
      jobs = await this.buildToolJobs(workspaceId, dto.tools, manager);
      defaultName = `${project.name} pipeline`;
    } else if (dto.template) {
      const template = await manager.getRepository(Workflow).findOne({
        where: {
          workspace: { id: workspaceId },
          filePath: dto.template,
          isCanEdit: false,
        },
      });
      if (!template) {
        throw new NotFoundException(`Template "${dto.template}" not found`);
      }
      jobs = template.content.jobs;
      defaultName = template.name;
    } else {
      const source = await manager.getRepository(ProjectWorkflow).findOne({
        where: {
          id: dto.copyFromProjectWorkflowId,
          project: { workspace: { id: workspaceId } },
        },
        relations: { workflow: true },
      });
      if (!source?.workflow) {
        throw new NotFoundException(
          `Project workflow "${dto.copyFromProjectWorkflowId}" not found`,
        );
      }
      // Same workspace, same data key: encrypted inline config copies as is.
      jobs = source.workflow.content.jobs;
      defaultName = `${source.workflow.name} (copy)`;
    }

    const name = dto.name?.trim() || defaultName;
    const workflow = await manager.getRepository(Workflow).save(
      manager.getRepository(Workflow).create({
        name,
        content: this.normalize({ name, jobs }),
        filePath: `project-${projectId}-${randomUUID()}.yaml`,
        workspace: { id: workspaceId },
      }),
    );
    const binding = await manager.getRepository(ProjectWorkflow).save(
      manager.getRepository(ProjectWorkflow).create({
        projectId,
        workflowId: workflow.id,
      }),
    );
    binding.workflow = workflow;
    binding.triggers = [];
    return binding;
  }

  /** Renames a project workflow or replaces its pipeline. */
  async update(
    projectId: string,
    workspaceId: string,
    bindingId: string,
    dto: UpdateProjectWorkflowDto,
  ): Promise<ProjectWorkflow> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const binding = await this.findBinding(projectId, bindingId);
    if (!isProjectOwnedWorkflow(binding.workflow.filePath, projectId)) {
      throw new BadRequestException(
        'This workflow is not owned by the project and cannot be edited here',
      );
    }

    const name = dto.name?.trim() || binding.workflow.name;
    let content: WorkflowContent = { ...binding.workflow.content, name };
    if (dto.tools) {
      if (dto.tools.length === 0) {
        throw new BadRequestException('A pipeline needs at least one tool');
      }
      const jobs = await this.buildToolJobs(
        workspaceId,
        dto.tools,
        this.dataSource.manager,
        binding.workflow.content.jobs,
      );
      // A new pipeline keeps when the workflow runs.
      content = { name, jobs, ...(content.on ? { on: content.on } : {}) };
    }
    // Project workflows never trigger on target events; their schedules and
    // "assets added" stay (see workflow-on.ts).
    if (content.on?.target) {
      content.on = { ...content.on };
      delete content.on.target;
      if (Object.keys(content.on).length === 0) delete content.on;
    }

    binding.workflow = await this.workflowsService.updateWorkflow(
      binding.workflow.id,
      { name, content },
      { id: workspaceId },
    );
    return binding;
  }

  /**
   * Deletes a binding. Its workflow goes too when the project owns it (runs
   * cascade with it); a workflow bound from elsewhere is only unbound.
   * Schedulers must already be unregistered.
   */
  /** Removes a workflow from the project; returns it as it was. */
  async remove(projectId: string, bindingId: string): Promise<ProjectWorkflow> {
    const binding = await this.findBinding(projectId, bindingId);
    if (isProjectOwnedWorkflow(binding.workflow?.filePath, projectId)) {
      await this.workflowRepo.delete(binding.workflow.id);
    } else {
      await this.bindingRepo.delete(binding.id);
    }
    return binding;
  }

  /** Deletes every workflow the project owns (project delete). */
  async removeOwnedWorkflows(projectId: string): Promise<void> {
    const bindings = await this.bindingRepo.find({
      where: { projectId },
      relations: { workflow: true },
    });
    const owned = bindings
      .filter((binding) =>
        isProjectOwnedWorkflow(binding.workflow?.filePath, projectId),
      )
      .map((binding) => binding.workflow.id);
    if (owned.length > 0) await this.workflowRepo.delete(owned);
  }

  /** Manual run from the project page, on all or some of its assets. */
  async runManual(
    projectId: string,
    workspaceId: string,
    bindingId: string,
    assetIds?: string[],
  ): Promise<RunStartedDto> {
    await findProjectOrFail(this.projectRepo, projectId, workspaceId, {
      writable: true,
    });
    const binding = await this.findBinding(projectId, bindingId);
    return this.startBindingRun(binding, {
      jobRunType: JobRunType.MANUAL,
      assetIds,
    });
  }

  /** Loads a binding with what a run needs (workflow, workspace, project). */
  async findBinding(
    projectId: string,
    bindingId: string,
  ): Promise<ProjectWorkflow> {
    const binding = await this.bindingRepo.findOne({
      where: { id: bindingId, projectId },
      relations: { workflow: { workspace: true }, project: true },
    });
    if (!binding?.workflow) {
      throw new NotFoundException(`Project workflow "${bindingId}" not found`);
    }
    return binding;
  }

  /**
   * Starts a run of a binding on the project's assets, recording the project,
   * the binding and the trigger on the run.
   */
  async startBindingRun(
    binding: ProjectWorkflow,
    opts: StartBindingRunOptions,
  ): Promise<RunStartedDto> {
    const rows: Array<{ assetId: string }> = await this.dataSource.query(
      `SELECT "assetId" FROM project_assets WHERE "projectId" = $1`,
      [binding.projectId],
    );
    const inProject = new Set(rows.map((row) => row.assetId));
    const assetIds = opts.assetIds
      ? opts.assetIds.filter((id) => inProject.has(id))
      : [...inProject];
    if (assetIds.length === 0) {
      throw new BadRequestException(
        opts.assetIds
          ? 'None of the selected assets belong to the project'
          : 'The project has no assets to scan',
      );
    }

    // Every root step must be installed before the run starts: a run whose
    // first step silently fails is worse than a clear 400 here.
    await this.assertWorkflowRootToolsInstalled(binding.workflow);

    const { jobHistory } = await this.workflowRunnerService.startRun({
      workflow: binding.workflow,
      workspaceId: binding.workflow.workspace.id,
      jobName: binding.project?.name ?? binding.workflow.name,
      jobRunType: opts.jobRunType,
      // Project runs stay pinned to the project's assets — the scope is what
      // stops a subdomain step from fanning the run out to the whole target.
      assetIds,
      projectId: binding.projectId,
      projectWorkflowId: binding.id,
      triggerId: opts.triggerId,
      causedByRunId: opts.causedByRunId,
      chainDepth: opts.chainDepth,
    });
    if (!jobHistory) {
      throw new BadRequestException(
        'The workflow has nothing to run on these assets',
      );
    }
    return { jobHistoryId: jobHistory.id, assets: assetIds.length };
  }

  /**
   * Turns the tool inputs into a staged pipeline: checks the tools exist,
   * connectors have a profile or inline config and categories are declared,
   * then encrypts the sensitive inline fields. A secret the client sent back
   * unchanged (the stored ciphertext, or its mask) keeps the stored value.
   */
  async buildToolJobs(
    workspaceId: string,
    inputs: ProjectToolInput[],
    manager: EntityManager = this.dataSource.manager,
    previous: Record<string, WorkflowJob> = {},
  ): Promise<Record<string, WorkflowJob>> {
    const toolIds = [...new Set(inputs.map((input) => input.toolId))];
    const tools = await manager.find(Tool, { where: { id: In(toolIds) } });
    const toolById = new Map(tools.map((tool) => [tool.id!, tool]));
    const missing = toolIds.filter((id) => !toolById.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `One or more tools with IDs "${missing.join(', ')}" not found`,
      );
    }

    const connectorIds = tools
      .filter((tool) => tool.type === WorkerType.CONNECTOR)
      .map((tool) => tool.id!);
    const profileToolIds = connectorIds.length
      ? await this.toolsService.getProfileToolIds(workspaceId, connectorIds)
      : new Set<string>();
    const dek = await this.encryptionService.getDEK(workspaceId);
    const previousByRun = new Map(
      Object.values(previous).map((job) => [job.run, job]),
    );

    const steps: PipelineStep[] = inputs.map((input) => {
      const tool = toolById.get(input.toolId)!;
      if (tool.type === WorkerType.CONNECTOR) {
        const hasInlineConfig =
          !!input.config && Object.keys(input.config).length > 0;
        if (
          !hasInlineConfig &&
          !input.configProfileId &&
          !profileToolIds.has(tool.id!)
        ) {
          throw new BadRequestException(
            `Tool "${tool.name}" requires a configuration profile or inline config.`,
          );
        }
      }
      try {
        const capability = resolveToolCategory(tool, input.category);
        resolveStepInputs(tool.name, capability, input.input);
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }

      let config = input.config;
      if (config && tool.type === WorkerType.CONNECTOR) {
        const schema = this.connectorRegistry.getConnector(tool.name)?.configSchema;
        const sensitive = getSensitiveFields(schema);
        const stored = previousByRun.get(tool.name)?.config ?? {};
        const keep = sensitive.filter(
          (field) =>
            field in stored &&
            (config![field] === stored[field] || isMaskedValue(config![field])),
        );
        config = {
          ...encryptInlineConfig(
            config,
            sensitive.filter((field) => !keep.includes(field)),
            dek,
          ),
          ...Object.fromEntries(keep.map((field) => [field, stored[field]])),
        };
      }

      return {
        run: tool.name,
        ...(input.category ? { category: input.category } : {}),
        ...(input.input?.length ? { input: input.input } : {}),
        ...(config ? { config } : {}),
        ...(input.configProfileId
          ? { configProfileId: input.configProfileId }
          : {}),
        ...(input.stage ? { stage: input.stage } : {}),
      };
    });

    return buildPipelineJobs(steps);
  }

  /** Validates the graph (400 with every error) and returns it canonical. */
  private normalize(content: WorkflowContent): WorkflowContent {
    try {
      return normalizeWorkflowContent(content);
    } catch (error) {
      if (error instanceof WorkflowGraphError) {
        throw new BadRequestException(
          `Invalid workflow content: ${error.errors.join('; ')}`,
        );
      }
      throw error;
    }
  }

  /**
   * Requires every root step's tool (a step without `needs`) to be installed in
   * the workspace. Steps reached later through `needs` are resolved by the
   * workflow runner, which fails the step and skips its dependents.
   */
  private async assertWorkflowRootToolsInstalled(
    workflow: Workflow,
  ): Promise<void> {
    const graph = buildWorkflowGraph(workflow.content);
    const rootToolNames = [
      ...new Set(
        graph.steps
          .filter((step) => step.needs.length === 0)
          .map((step) => step.run),
      ),
    ];
    if (rootToolNames.length === 0) return;

    const tools = await this.toolsService.getToolByNames({
      names: rootToolNames,
      isInstalled: true,
    });
    const installed = new Set(tools.map((tool) => tool.name));
    const missing = rootToolNames.find((name) => !installed.has(name));

    if (missing) {
      this.logger.warn(
        `Project run refused: tool "${missing}" is not installed in workspace ${workflow.workspace?.id ?? 'unknown'}`,
      );
      throw new BadRequestException(
        `Tool "${missing}" is not installed in the workspace.`,
      );
    }
  }
}
