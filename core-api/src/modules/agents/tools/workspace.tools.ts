import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import {
  detailIssueSchema,
  detailVulnSchema,
  listIssuesSchema,
  listJobsSchema,
  listToolsSchema,
  listWorkersSchema,
} from '@/mcp/mcp.schema';
import { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { IssuesService } from '@/modules/issues/issues.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { ProjectResultsService } from '@/modules/projects/project-results.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { getSensitiveFields } from '@/modules/tools/validators/tool-config-profiles.crypto';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import { WorkersService } from '@/modules/workers/workers.service';

import { AgentFunction } from './agent-function';
import { NEWEST_FIRST, pageOf, projectFor, projectIdInput } from './helpers';
import type { AgentFunctionContext } from './types';

// Tools over the workspace's OASM data, offered in every agent mode. The
// project-aware ones take a projectId, or are locked to the conversation's.
// Listing and filtering hosts, services, technologies, TLS, findings and
// targets goes through query_attack_surface (AttackSurfaceQueryTools).

const statisticsInput = z.object(projectIdInput);

export interface ConfigFieldInfo {
  name: string;
  type?: unknown;
  required: boolean;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  secret?: true;
}

/**
 * The fields of a connector's configSchema as the model reads them: what each
 * one means, never a value. `ui:*` keys are form hints and are dropped.
 */
export function describeConfigFields(
  schema: Record<string, unknown> | null,
): ConfigFieldInfo[] {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object') return [];
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as unknown[]) : [],
  );
  const secrets = new Set(getSensitiveFields(schema));
  return Object.entries(properties as Record<string, unknown>).map(
    ([name, raw]) => {
      const prop = (raw && typeof raw === 'object' ? raw : {}) as Record<
        string,
        unknown
      >;
      const description = prop.description ?? prop.title;
      return {
        name,
        type: prop.type,
        required: required.has(name),
        ...(typeof description === 'string' ? { description } : {}),
        ...(Array.isArray(prop.enum) ? { enum: prop.enum } : {}),
        ...(prop.default !== undefined ? { default: prop.default } : {}),
        ...(secrets.has(name) ? { secret: true as const } : {}),
      };
    },
  );
}

@Injectable()
export class WorkspaceTools {
  constructor(
    readonly vulnerabilitiesService: VulnerabilitiesService,
    readonly projectResultsService: ProjectResultsService,
    readonly statisticService: StatisticService,
    readonly issuesService: IssuesService,
    readonly toolsService: ToolsService,
    readonly connectorRegistry: ConnectorRegistryService,
    readonly workersService: WorkersService,
    readonly jobsRegistryService: JobsRegistryService,
  ) {}

  @AgentFunction({
    name: 'gather_statistics',
    description:
      "Return security dashboard summary: asset/vulnerability counts, severity breakdown, security score. Params: projectId (that project's overview instead: assets, open vulnerabilities by severity, runs, recent activity).",
    inputSchema: statisticsInput,
    permissions: ['workspace.read'],
    readOnly: true,
    mcp: true,
  })
  gatherStatistics(
    params: z.infer<typeof statisticsInput>,
    ctx: AgentFunctionContext,
  ) {
    const projectId = projectFor(ctx, params);
    return projectId
      ? this.projectResultsService.overview(projectId, ctx.workspaceId)
      : this.statisticService.getStatistics(ctx.workspaceId);
  }

  @AgentFunction({
    name: 'investigate_vulnerability',
    description:
      'Get full vulnerability report: CVSS/EPSS, PoC, remediation, code location, lifecycle (detectionStatus, timesDetected, resurfacedCount, fixedAt, fixClaimedAt, dueAt), review (reviewStatus, reviewNote), discoveredBy, every source (tool run or AI agent, with evidence), dismissal and the open remediation issue. Params: vulnId.',
    inputSchema: detailVulnSchema,
    permissions: ['vulnerability.read'],
    readOnly: true,
    mcp: true,
  })
  investigateVulnerability(
    params: z.infer<typeof detailVulnSchema>,
    ctx: AgentFunctionContext,
  ) {
    return this.vulnerabilitiesService.getVulnerability(
      params.vulnId ?? params.id,
      ctx.workspaceId,
    );
  }

  @AgentFunction({
    name: 'enumerate_open_issues',
    description: [
      'List issues (work items) of the workspace, most recently updated first.',
      'Params: page, limit, search (title or #number), status (open, in_progress, resolved, closed), type (vulnerability_remediation, task, asset_review, scan_failure), priority (p1-p4), assigneeId, mine, overdue, resourceType + resourceId (issues linked to e.g. a vulnerability).',
      'Each item: id, no, title, type, status, priority, resolution, dueAt, assignee, tags, linkCount, ruleId (set when a rule opened it), progress ({done,total} of linked findings, or null).',
    ],
    inputSchema: listIssuesSchema,
    permissions: ['workspace.read'],
    readOnly: true,
    mcp: true,
  })
  async enumerateOpenIssues(
    params: z.infer<typeof listIssuesSchema>,
    ctx: AgentFunctionContext,
  ) {
    // MCP calls run without a user, so "mine" has no one to mean
    if (params.mine && !ctx.userId) {
      return {
        success: false,
        message: '"mine" is not available here: pass assigneeId instead.',
      };
    }
    const response = await this.issuesService.getMany(
      {
        ...pageOf(params),
        sortBy: 'updatedAt',
        sortOrder: SortOrder.DESC,
        search: params.search,
        status: params.status,
        type: params.type,
        priority: params.priority,
        assigneeId: params.assigneeId,
        mine: params.mine,
        overdue: params.overdue,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
      ctx.workspaceId,
      ctx.userId,
    );
    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        no: i.no,
        title: i.title,
        type: i.type,
        status: i.status,
        priority: i.priority,
        resolution: i.resolution,
        dueAt: i.dueAt,
        assignee: i.assignee,
        tags: i.tags,
        linkCount: i.linkCount,
        ruleId: i.ruleId,
        progress: i.progress,
      })),
    };
  }

  @AgentFunction({
    name: 'inspect_issue',
    description:
      'Get one issue by issueId: fields, progress, and its links (resourceType, resourceId and a summary of each linked vulnerability, asset, target, project or run; missing=true when deleted).',
    inputSchema: detailIssueSchema,
    permissions: ['workspace.read'],
    readOnly: true,
    mcp: true,
  })
  inspectIssue(
    params: z.infer<typeof detailIssueSchema>,
    ctx: AgentFunctionContext,
  ) {
    return this.issuesService.getById(params.issueId, ctx.workspaceId);
  }

  /**
   * The tools the agent can use in this workspace — built-in tools plus the
   * installed agent connectors — and, for connectors, what each config field
   * means.
   */
  @AgentFunction({
    name: 'display_available_tools',
    description: [
      'List the security tools/scanners the agent can use in this workspace: built-in tools and the installed connectors that support the agent.',
      'Each item: id, name, type (built_in or connector), categories (modes it can run in), description, and config for connectors that take configuration.',
      'type decides how it runs: built_in → execute_remote_command with the tool name as the command; connector → run_tool_connector.',
      "config lists the connector's settings: name, type, required, description (what the field controls), enum, default, secret (a credential).",
      'Set non-secret fields yourself in run_tool_connector config to fit the task. Secret fields and required ones you cannot fill come from a config profile (list_tool_config_profiles); without one, tell the user which fields the profile needs.',
      'Returns a JSON array, sorted by name. Params: q (search by name or description).',
    ],
    inputSchema: listToolsSchema,
    permissions: ['workspace.read'],
    readOnly: true,
  })
  async displayAvailableTools(
    params: z.infer<typeof listToolsSchema>,
    ctx: AgentFunctionContext,
  ) {
    const tools = await this.toolsService.getAgentTools(
      ctx.workspaceId,
      params.q,
    );
    return tools.map((i) => {
      const config =
        i.type === WorkerType.CONNECTOR
          ? describeConfigFields(
              this.connectorRegistry.getConnectorSchema(i.name),
            )
          : [];
      return {
        id: i.id,
        name: i.name,
        type: i.type,
        categories: (i.categories ?? []).map((c) => c.name),
        description: i.description,
        ...(config.length > 0 ? { config } : {}),
      };
    });
  }

  @AgentFunction({
    name: 'list_active_workers',
    description:
      'List connected worker nodes. Params: page, limit, q (search query).',
    inputSchema: listWorkersSchema,
    permissions: ['worker.read'],
    readOnly: true,
    mcp: true,
  })
  async listActiveWorkers(
    params: z.infer<typeof listWorkersSchema>,
    ctx: AgentFunctionContext,
  ) {
    // This workspace's own workers and the global ones
    const response = await this.workersService.getWorkers(
      {
        ...pageOf(params),
        ...NEWEST_FIRST,
        search: params.q,
        enabledAgentMode: true,
      },
      { agentWorkspaceId: ctx.workspaceId },
    );
    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        name: i.name,
        scope: i.scope === WorkerScope.CLOUD ? 'global' : 'workspace',
      })),
    };
  }

  @AgentFunction({
    name: 'review_jobs',
    description:
      'List background scan jobs with status. Params: page, limit, jobHistoryId, jobStatus (completed/failed/active).',
    inputSchema: listJobsSchema,
    permissions: ['job.read'],
    readOnly: true,
    mcp: true,
  })
  async reviewJobs(
    params: z.infer<typeof listJobsSchema>,
    ctx: AgentFunctionContext,
  ) {
    const response = await this.jobsRegistryService.getManyJobs(
      ctx.workspaceId,
      {
        ...pageOf(params),
        ...NEWEST_FIRST,
        jobHistoryId: params.jobHistoryId,
        jobStatus: params.jobStatus,
      },
    );
    return {
      ...response,
      data: response.data.map((i) => ({ id: i.id, status: i.status })),
    };
  }
}
