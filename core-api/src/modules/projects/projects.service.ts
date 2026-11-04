import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { JobRunType, ProjectTriggerType } from '@/common/enums/enum';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { openVulnerabilityCondition } from '@/modules/vulnerabilities/open-vulnerability';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { ProjectAssetDiscovery } from '../event-bridge/sinks/projects/projects.sink';
import type { CreateProjectDto } from './dto/create-project.dto';
import {
  type GetProjectsQueryDto,
  type ProjectListItemDto,
  ProjectStatusFilter,
} from './dto/get-projects.dto';
import type {
  ScopeRuleInputDto,
  ScopeSyncResultDto,
} from './dto/project-scope.dto';
import type { RunStartedDto } from './dto/project-workflow.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';
import { findProjectOrFail } from './project-access';
import { ProjectAssetsService } from './project-assets.service';
import { ProjectScopeService } from './project-scope.service';
import { ProjectTriggersService } from './project-triggers.service';
import { ProjectWorkflowsService } from './project-workflows.service';

/** List sort keys beyond plain columns. */
const LIST_SORT: Record<string, string> = {
  name: 'p.name',
  createdAt: 'p."createdAt"',
  updatedAt: 'p."updatedAt"',
  lastRunAt: '"lastRunAt"',
  totalAssets: '"totalAssets"',
};

@Injectable()
export class ProjectsService implements ProjectAssetDiscovery {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly assets: ProjectAssetsService,
    private readonly scope: ProjectScopeService,
    private readonly workflows: ProjectWorkflowsService,
    private readonly triggers: ProjectTriggersService,
  ) {}

  /** Project cards: counts, open vulnerabilities, last run and triggers. */
  async getMany(query: GetProjectsQueryDto, workspaceId: string) {
    const params: unknown[] = [workspaceId];
    const where = ['p."workspaceId" = $1'];
    if (query.status === ProjectStatusFilter.ARCHIVED) {
      where.push('p."archivedAt" IS NOT NULL');
    } else if (query.status !== ProjectStatusFilter.ALL) {
      where.push('p."archivedAt" IS NULL');
    }
    if (query.search?.trim()) {
      params.push(`%${query.search.trim()}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }
    if (query.targetIds?.length) {
      params.push(query.targetIds);
      where.push(
        `EXISTS (SELECT 1 FROM project_assets pa JOIN assets a ON a.id = pa."assetId" WHERE pa."projectId" = p.id AND a."targetId" = ANY($${params.length}::uuid[]))`,
      );
    }
    const whereSql = where.join(' AND ');
    const direction = query.sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';
    // "risk": most open critical findings first, then high, then medium.
    const order =
      query.sortBy === 'risk'
        ? `vc.critical ${direction}, vc.high ${direction}, vc.medium ${direction}`
        : `${LIST_SORT[query.sortBy] ?? 'p."createdAt"'} ${direction} NULLS LAST`;
    const limit = Number(query.limit);
    const offset = (Number(query.page) - 1) * limit;

    const [[{ total }], rows] = await Promise.all([
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM projects p WHERE ${whereSql}`,
        params,
      ),
      this.dataSource.query<Array<Record<string, unknown>>>(
        `SELECT p.id, p.name, p."hexColor", p.description, p."archivedAt", p."createdAt", p."updatedAt",
                (SELECT COUNT(*)::int FROM project_assets pa WHERE pa."projectId" = p.id) AS "totalAssets",
                (SELECT COUNT(*)::int FROM project_workflows pw WHERE pw."projectId" = p.id) AS "workflowCount",
                (SELECT MAX(jh."createdAt") FROM job_histories jh WHERE jh."projectId" = p.id) AS "lastRunAt",
                vc.*
           FROM projects p
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE v.severity = 'critical')::int AS critical,
                    COUNT(*) FILTER (WHERE v.severity = 'high')::int AS high,
                    COUNT(*) FILTER (WHERE v.severity = 'medium')::int AS medium,
                    COUNT(*) FILTER (WHERE v.severity = 'low')::int AS low,
                    COUNT(*) FILTER (WHERE v.severity = 'info')::int AS info,
                    COUNT(*) FILTER (WHERE pv."firstSeenAt" > now() - interval '7 days')::int AS "newVulnerabilities"
               FROM project_vulnerabilities pv
               JOIN vulnerabilities v ON v.id = pv."vulnerabilityId"
              WHERE pv."projectId" = p.id AND ${openVulnerabilityCondition('v')}
           ) vc ON true
          WHERE ${whereSql}
          ORDER BY ${order}, p.id
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    const ids = rows.map((row) => row.id as string);
    const triggers: Array<{
      id: string;
      projectId: string;
      projectWorkflowId: string;
      type: ProjectTriggerType;
      cron: string | null;
      enabled: boolean;
    }> = ids.length
      ? await this.dataSource.query(
          `SELECT t.id, pw."projectId", t."projectWorkflowId", t.type, t.cron, t.enabled
             FROM project_workflow_triggers t
             JOIN project_workflows pw ON pw.id = t."projectWorkflowId"
            WHERE pw."projectId" = ANY($1::uuid[])
            ORDER BY t."createdAt"`,
          [ids],
        )
      : [];

    const data: ProjectListItemDto[] = rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      hexColor: row.hexColor as string,
      description: (row.description as string | null) ?? null,
      archivedAt: (row.archivedAt as Date | null) ?? null,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
      totalAssets: Number(row.totalAssets ?? 0),
      workflowCount: Number(row.workflowCount ?? 0),
      lastRunAt: (row.lastRunAt as Date | null) ?? null,
      openVulnerabilities: {
        critical: Number(row.critical ?? 0),
        high: Number(row.high ?? 0),
        medium: Number(row.medium ?? 0),
        low: Number(row.low ?? 0),
        info: Number(row.info ?? 0),
      },
      newVulnerabilities: Number(row.newVulnerabilities ?? 0),
      triggers: triggers
        .filter((trigger) => trigger.projectId === row.id)
        .map((trigger) => ({
          id: trigger.id,
          projectWorkflowId: trigger.projectWorkflowId,
          type: trigger.type,
          cron: trigger.cron,
          enabled: trigger.enabled,
        })),
    }));
    return getManyResponse({ query, data, total });
  }

  /** One project with its workflows (triggers, last run) and asset count. */
  async getById(id: string, workspaceId: string): Promise<Project> {
    const project = await findProjectOrFail(this.projectRepo, id, workspaceId);
    project.projectWorkflows = await this.workflows.list(id, workspaceId);
    project.totalAssets = await this.countAssets(id);
    project.lastRunAt =
      project.projectWorkflows
        .map((binding) => binding.lastRun?.createdAt)
        .filter((at): at is Date => !!at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
      null;
    return project;
  }

  /**
   * Creates the project with its scope, pipeline and triggers in one
   * request. A failure part-way removes whatever was created (schedulers,
   * workflows, the project), so no half-built project is left behind.
   */
  async create(dto: CreateProjectDto, workspaceId: string): Promise<Project> {
    const workspace = await this.dataSource.manager.findOneBy(Workspace, {
      id: workspaceId,
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace with ID "${workspaceId}" not found`);
    }
    const existing = await this.projectRepo.findOne({
      where: { name: dto.name, workspace: { id: workspaceId } },
    });
    if (existing) {
      throw new BadRequestException(
        `A project named "${dto.name}" already exists in this workspace`,
      );
    }
    const hasPipeline = !!dto.tools?.length || !!dto.template;
    if ((dto.schedule || dto.onAssetsAdded || dto.runNow) && !hasPipeline) {
      throw new BadRequestException(
        'schedule, onAssetsAdded and runNow need a pipeline (tools or template)',
      );
    }
    // Fail fast on bad rules before anything is written.
    if (dto.scopeRules?.length) {
      await this.scope.normalizeRules(workspaceId, dto.scopeRules);
    }

    const project = await this.projectRepo.save(
      this.projectRepo.create({
        name: dto.name,
        hexColor: dto.hexColor,
        description: dto.description?.trim() || null,
        autoAddAssets: dto.autoAddAssets ?? true,
        workspace: { id: workspaceId },
      }),
    );

    try {
      if (dto.hostIds?.length) {
        await this.assets.add(project.id, workspaceId, dto.hostIds);
      }
      if (dto.scopeRules?.length) {
        await this.scope.replaceRules(project.id, workspaceId, dto.scopeRules);
      }
      if (hasPipeline) {
        const binding = await this.workflows.create(project.id, workspaceId, {
          name: dto.workflowName,
          ...(dto.tools?.length ? { tools: dto.tools } : { template: dto.template }),
        });
        if (dto.schedule && dto.schedule !== 'disabled') {
          await this.triggers.create(project.id, workspaceId, {
            projectWorkflowId: binding.id,
            type: ProjectTriggerType.CRON,
            cron: dto.schedule,
          });
        }
        if (dto.onAssetsAdded) {
          await this.triggers.create(project.id, workspaceId, {
            projectWorkflowId: binding.id,
            type: ProjectTriggerType.ASSETS_ADDED,
            config: dto.onAssetsAdded,
          });
        }
        // Rules that match nothing yet are a normal start: "run now" then has
        // nothing to scan, which must not undo the project.
        if (dto.runNow && (await this.countAssets(project.id)) > 0) {
          const full = await this.workflows.findBinding(project.id, binding.id);
          await this.workflows.startBindingRun(full, {
            jobRunType: JobRunType.MANUAL,
          });
        }
      }
    } catch (error) {
      await this.removeEverything(project.id).catch((rollbackError: unknown) => {
        this.logger.error(
          `Failed to roll back project ${project.id}: ${(rollbackError as Error).message}`,
        );
      });
      throw error;
    }
    return project;
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    workspaceId: string,
  ): Promise<Project> {
    const project = await findProjectOrFail(this.projectRepo, id, workspaceId, {
      writable: true,
    });
    if (dto.name !== undefined && dto.name !== project.name) {
      const clash = await this.projectRepo.findOne({
        where: { name: dto.name, workspace: { id: workspaceId } },
      });
      if (clash) {
        throw new BadRequestException(
          `A project named "${dto.name}" already exists in this workspace`,
        );
      }
      project.name = dto.name;
    }
    if (dto.hexColor !== undefined) project.hexColor = dto.hexColor;
    if (dto.description !== undefined) {
      project.description = dto.description?.trim() || null;
    }
    if (dto.autoAddAssets !== undefined) {
      project.autoAddAssets = dto.autoAddAssets;
    }
    return this.projectRepo.save(project);
  }

  /** Stops every schedule and event trigger; data stays, read-only. */
  async archive(id: string, workspaceId: string): Promise<Project> {
    const project = await findProjectOrFail(this.projectRepo, id, workspaceId);
    if (project.archivedAt) return project;
    await this.triggers.unregisterProject(id);
    project.archivedAt = new Date();
    return this.projectRepo.save(project);
  }

  /** Reopens an archived project and registers its enabled schedules again. */
  async unarchive(id: string, workspaceId: string): Promise<Project> {
    const project = await findProjectOrFail(this.projectRepo, id, workspaceId);
    if (!project.archivedAt) return project;
    project.archivedAt = null;
    const saved = await this.projectRepo.save(project);
    await this.triggers.registerProject(id);
    return saved;
  }

  /**
   * Deletes the project, its schedulers and the workflows it owns (their runs
   * cascade). Vulnerabilities stay in the workspace; their project links go.
   */
  async delete(id: string, workspaceId: string): Promise<DefaultMessageResponseDto> {
    await findProjectOrFail(this.projectRepo, id, workspaceId);
    await this.removeEverything(id);
    return { message: `Project "${id}" successfully deleted` };
  }

  async addAssets(
    id: string,
    workspaceId: string,
    assetIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    const added = await this.assets.add(id, workspaceId, assetIds);
    await this.triggers.onAssetsAdded(id, added);
    return { message: `${added.length} assets added to the project` };
  }

  async removeAssets(
    id: string,
    workspaceId: string,
    assetIds: string[],
  ): Promise<DefaultMessageResponseDto> {
    const removed = await this.assets.remove(id, workspaceId, assetIds);
    return { message: `${removed} assets removed from the project` };
  }

  /** Saves the rules, syncs the rule-added assets, notifies the triggers. */
  async replaceScope(
    id: string,
    workspaceId: string,
    rules: ScopeRuleInputDto[],
    autoAddAssets?: boolean,
  ): Promise<ScopeSyncResultDto> {
    const result = await this.scope.replaceRules(
      id,
      workspaceId,
      rules,
      autoAddAssets,
    );
    await this.triggers.onAssetsAdded(id, result.added);
    return { added: result.added.length, removed: result.removed };
  }

  /**
   * A discovery batch (`asset.discovered`): joins the projects whose rules
   * select it, and those projects' "assets added" triggers pick it up.
   */
  async addDiscoveredAssets(
    workspaceId: string,
    assetIds: string[],
  ): Promise<void> {
    const added = await this.scope.addDiscoveredAssets(workspaceId, assetIds);
    for (const [projectId, projectAssetIds] of added) {
      await this.triggers.onAssetsAdded(projectId, projectAssetIds);
    }
  }

  /** Unregisters a workflow's schedules, then deletes it. */
  async removeWorkflow(
    id: string,
    workspaceId: string,
    bindingId: string,
  ): Promise<DefaultMessageResponseDto> {
    await findProjectOrFail(this.projectRepo, id, workspaceId, {
      writable: true,
    });
    await this.triggers.unregisterProject(id, bindingId);
    await this.workflows.remove(id, bindingId);
    return { message: 'Workflow removed from the project' };
  }

  async runWorkflow(
    id: string,
    workspaceId: string,
    bindingId: string,
    assetIds?: string[],
  ): Promise<RunStartedDto> {
    return this.workflows.runManual(id, workspaceId, bindingId, assetIds);
  }

  private async countAssets(projectId: string): Promise<number> {
    const [row]: Array<{ count: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM project_assets WHERE "projectId" = $1`,
      [projectId],
    );
    return row?.count ?? 0;
  }

  private async removeEverything(projectId: string): Promise<void> {
    await this.triggers.unregisterProject(projectId);
    await this.workflows.removeOwnedWorkflows(projectId);
    await this.projectRepo.delete(projectId);
  }
}
