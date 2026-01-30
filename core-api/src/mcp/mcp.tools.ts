import {
  GET_WORKSPACE_MCP_TOOL_NAME,
  WORKER_TIMEOUT,
} from '@/common/constants/app.constants';
import { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { AssetsService } from '@/modules/assets/assets.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { IssuesService } from '@/modules/issues/issues.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { WorkersService } from '@/modules/workers/workers.service';
import { IssueStatus, WorkerType } from '@/common/enums/enum';
import { Injectable } from '@nestjs/common';
import { Context, Tool } from '@rekog/mcp-nest';
import z from 'zod';
import {
  detailAssetSchema,
  detailIssueSchema,
  detailVulnSchema,
  getAssetsSchema,
  getManyBaseResponseSchema,
  getStatisticOutPutSchema,
  getTargetsSchema,
  getVulnerabilitiesSchema,
  listAssetsInTargetSchema,
  listIssuesSchema,
  listJobsSchema,
  listToolsSchema,
  listWorkersSchema,
  workspaceParamSchema,
} from './mcp.schema';

@Injectable()
export class McpTools {
  constructor(
    private assetsService: AssetsService,
    private workspaceService: WorkspacesService,
    private targetsService: TargetsService,
    private statisticService: StatisticService,
    private vulnerabilitiesService: VulnerabilitiesService,
    private issuesService: IssuesService,
    private toolsService: ToolsService,
    private workersService: WorkersService,
    private jobsRegistryService: JobsRegistryService,
  ) {}

  @Tool({
    name: GET_WORKSPACE_MCP_TOOL_NAME,
    description:
      'Retrieves a list of workspaces accessible to the user. This is typically the first tool to call to obtain the "workspaceId" required for almost all other operations.',
    outputSchema: z.object({
      workspaces: z
        .array(
          z.object({
            id: z.string().describe('The unique identifier of the workspace.'),
            name: z
              .string()
              .describe('The human-readable name of the workspace.'),
          }),
        )
        .describe('A list of workspaces the user has permission to access.'),
    }),
  })
  async getWorkspaces(_, context: Context, req: RequestWithMetadata) {
    const workspaceIds = req.mcp?.permissions?.value.map((p) => p.workspaceId);

    if (!workspaceIds || workspaceIds.length === 0) {
      return { workspaces: [] };
    }

    const workspaces = await this.workspaceService
      .getWorkspacesByIds(workspaceIds)
      .then((res) =>
        res.map((i) => ({
          id: i.id,
          name: i.name,
        })),
      );

    return { workspaces };
  }

  @Tool({
    name: 'get_assets',
    description:
      'Lists discovered assets (domains, subdomains, IPs, URLs) within a workspace. Assets represent the entities found during scanning, distinct from targets (scope) or tools (scanners). Use this when the user asks about discovered infrastructure, IPs, or domains. Keywords: asset, domain, IP, URL.',
    parameters: getAssetsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the asset.'),
        value: z
          .string()
          .describe(
            'The actual value of the asset (e.g., "example.com" or "192.168.1.1").',
          ),
      }),
    ),
  })
  async getAssets(params: z.infer<typeof getAssetsSchema>) {
    const { workspaceId, page, limit, value } = params;
    const response = await this.assetsService.getManyAsssetServices(
      {
        limit: limit || 100,
        page: page || 1,
        sortBy: 'createdAt',
        value,
      },
      workspaceId,
    );
    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        value: i.value,
      })),
    };
  }

  @Tool({
    name: 'get_vulnerabilities',
    description:
      'Retrieves a list of security vulnerabilities identified during scans. Provides high-level info like name and severity. Use this when the user asks about security issues, CVEs, or "vulns". For in-depth technical details or remediation steps, use "detail_vuln". Keywords: vulnerability, vuln, CVE, security issue.',
    parameters: getVulnerabilitiesSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the vulnerability.'),
        name: z.string().describe('The title or name of the vulnerability.'),
        severity: z
          .string()
          .describe('Severity level: CRITICAL, HIGH, MEDIUM, LOW, or INFO.'),
      }),
    ),
  })
  async getVulnerabilities(params: z.infer<typeof getVulnerabilitiesSchema>) {
    const { workspaceId, page, limit, q } = params;
    const response = await this.vulnerabilitiesService.getVulnerabilities({
      limit,
      page,
      q,
      workspaceId,
      sortBy: 'createdAt',
    });
    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        name: i.name,
        severity: i.severity,
      })),
    };
  }

  @Tool({
    name: 'get_targets',
    description:
      'Lists defined targets (root domains, IP ranges, CIDRs) that constitute the scanning scope. Targets are the starting points for discovery, whereas assets are the actual items found. Use this when the user asks about the "scope" or "what is being scanned". Keywords: target, scan scope, root domain, IP range.',
    parameters: getTargetsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the target.'),
        value: z
          .string()
          .describe(
            'The target definition (e.g., "example.com" or "10.0.0.0/24").',
          ),
      }),
    ),
  })
  async getTargets(params: z.infer<typeof getTargetsSchema>) {
    const { workspaceId, page, limit, value } = params;
    const response = await this.targetsService.getTargetsInWorkspace(
      {
        limit: limit || 100,
        page: page || 1,
        sortBy: 'createdAt',
        value,
      },
      workspaceId,
    );
    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        value: i.value,
      })),
    };
  }

  @Tool({
    name: 'get_statistics',
    description:
      'Provides high-level security metrics and workspace statistics, including total counts of assets, targets, and vulnerabilities by severity. Also includes the overall security score and technology counts. Use this for summaries or "how many" questions. Keywords: statistics, summary, count, score, metrics.',
    parameters: workspaceParamSchema,
    outputSchema: getStatisticOutPutSchema,
  })
  getStatistics({ workspaceId }: z.infer<typeof workspaceParamSchema>) {
    return this.statisticService.getStatistics({ workspaceId });
  }

  @Tool({
    name: 'detail_asset',
    description:
      'Retrieves comprehensive details for a specific asset by its ID, including detected technologies (e.g., Nginx, WordPress), open ports, and metadata. Use this when the user asks for more information about a specific domain or IP. Keywords: asset details, technology, ports, service info.',
    parameters: detailAssetSchema,
    outputSchema: z.object({
      id: z.string().describe('The unique identifier of the asset.'),
      value: z.string().describe('The asset value.'),
      workspaceId: z.string().describe('The ID of the containing workspace.'),
      targetId: z
        .string()
        .nullable()
        .describe('The ID of the parent target if applicable.'),
      options: z
        .any()
        .optional()
        .describe('Additional asset configuration or metadata.'),
      createdAt: z
        .date()
        .or(z.string())
        .describe('The timestamp when the asset was first discovered.'),
      updatedAt: z
        .date()
        .or(z.string())
        .describe('The timestamp of the last update.'),
      technologies: z
        .array(z.any())
        .optional()
        .describe(
          'Detailed list of technologies and services detected on the asset.',
        ),
    }),
  })
  async getAssetDetails(params: z.infer<typeof detailAssetSchema>) {
    const { workspaceId, assetId } = params;
    return this.assetsService.getAssetById(assetId, workspaceId);
  }

  @Tool({
    name: 'list_assets_in_target',
    description:
      'Lists all assets discovered within the scope of a specific target ID. Useful for drilling down into what was found for a particular root domain or IP range. Keywords: assets in target, subdomain list for domain.',
    parameters: listAssetsInTargetSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the asset.'),
        value: z
          .string()
          .describe('The asset value (e.g., subdomain name or IP).'),
        type: z
          .string()
          .optional()
          .describe('The category or type of the asset.'),
      }),
    ),
  })
  async getAssetsInTarget(params: z.infer<typeof listAssetsInTargetSchema>) {
    const { workspaceId, targetId, limit, page, value } = params;
    return this.assetsService.getManyAsssetServices(
      {
        limit: limit || 100,
        page: page || 1,
        targetIds: [targetId],
        value,
        sortBy: 'createdAt',
      },
      workspaceId,
    );
  }

  @Tool({
    name: 'detail_vuln',
    description:
      'Retrieves full technical details for a specific vulnerability by its ID, including description, Proof of Concept (PoC), remediation steps, and references. Use this when the user needs to understand how to fix an issue or see evidence. Keywords: vuln details, fix, remediation, PoC, CVE info.',
    parameters: detailVulnSchema,
    outputSchema: z.object({
      id: z.string().describe('The unique identifier of the vulnerability.'),
      name: z.string().describe('Title of the vulnerability.'),
      severity: z.string().describe('Severity level.'),
      description: z
        .string()
        .optional()
        .describe('Detailed explanation of the security risk.'),
      remediation: z
        .string()
        .optional()
        .describe('Steps and recommendations to fix the vulnerability.'),
      proof: z
        .string()
        .optional()
        .describe('Proof of concept or evidence of the vulnerability.'),
      references: z
        .array(z.string())
        .optional()
        .describe('External links and resources for further reading.'),
      createdAt: z
        .date()
        .or(z.string())
        .describe('The timestamp when the vulnerability was reported.'),
    }),
  })
  async getVulnerabilityDetails(params: z.infer<typeof detailVulnSchema>) {
    const { workspaceId, vulnId } = params;
    return await this.vulnerabilitiesService.getVulnerability(
      vulnId,
      workspaceId,
    );
  }

  @Tool({
    name: 'list_issues',
    description:
      'Lists operational issues or security tasks tracked within the system (e.g., tickets, manual review tasks). Provides title, status, and creation date. Use this when the user asks about "tasks", "tickets", or "system problems". Keywords: issues, tasks, tickets, status.',
    parameters: listIssuesSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the issue.'),
        title: z.string().describe('The title or summary of the issue.'),
        status: z
          .string()
          .describe('The current status of the issue (e.g., OPEN, CLOSED).'),
        createdAt: z
          .date()
          .or(z.string())
          .describe('The timestamp when the issue was created.'),
      }),
    ),
  })
  async getIssues(params: z.infer<typeof listIssuesSchema>) {
    const { workspaceId, limit, page, search, status } = params;
    const response = await this.issuesService.getMany(
      {
        limit: limit || 100,
        page: page || 1,
        search,
        status: status as unknown as IssueStatus[],
        sortBy: 'createdAt',
      },
      workspaceId,
    );

    return {
      ...response,
      data: response.data.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        createdAt: i.createdAt,
      })),
    };
  }

  @Tool({
    name: 'detail_issue',
    description:
      'Retrieves detailed information for a specific issue by its ID, including full description, comments, and history. Use this to get the context or progress of a particular ticket. Keywords: issue details, comments, history.',
    parameters: detailIssueSchema,
    outputSchema: z.object({
      id: z.string().describe('The unique identifier of the issue.'),
      title: z.string().describe('The issue title.'),
      description: z
        .string()
        .optional()
        .describe('Full textual description of the issue.'),
      status: z.string().describe('The current status.'),
      workspaceId: z
        .string()
        .describe('The ID of the workspace this issue belongs to.'),
      comments: z
        .array(z.any())
        .optional()
        .describe(
          'List of comments or activity logs associated with the issue.',
        ),
    }),
  })
  async getIssueDetails(params: z.infer<typeof detailIssueSchema>) {
    const { workspaceId, issueId } = params;
    return this.issuesService.getById(issueId, workspaceId);
  }

  @Tool({
    name: 'list_tools',
    description:
      'Provides a catalog of available security software, scanning engines, and tool definitions (e.g., Nuclei, Nmap, Subfinder). Use this when the user asks what scanners are supported or the "software list". Keywords: tools list, scanner catalog, engine types.',
    parameters: listToolsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the tool.'),
        name: z.string().describe('The name of the tool (e.g., "Nuclei").'),
        description: z
          .string()
          .optional()
          .describe('A brief summary of what the tool does.'),
        version: z
          .string()
          .optional()
          .describe('The installed version of the tool.'),
        isInstalled: z
          .boolean()
          .optional()
          .describe('Whether the tool is currently active and installed.'),
        type: z
          .string()
          .optional()
          .describe('The type of the tool (built_in or provider).'),
      }),
    ),
  })
  async getTools(params: z.infer<typeof listToolsSchema>) {
    const { workspaceId, limit, page } = params;
    // q param is not supported by service yet
    const response = await this.toolsService.getManyTools({
      limit: limit || 100,
      page: page || 1,
      workspaceId,
      sortBy: 'createdAt',
    });

    return {
      ...response,
      data: response.data.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        version: t.version,
        isInstalled: t.isInstalled,
      })),
    };
  }

  @Tool({
    name: 'list_workers',
    description:
      'Lists the physical/virtual worker nodes and infrastructure machines (scanners) that are currently online and executing jobs. Use this when the user asks about system health, node status, workload, or "where are my scans running". Keywords: workers, nodes, infrared status, machines.',
    parameters: listWorkersSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('Unique identifier of the worker.'),
        name: z.string().describe('Readable name or ID fragment.'),
        status: z.string().describe('Current status: online or offline.'),
        type: z.string().describe('Worker type (e.g., BUILT_IN, PROVIDER).'),
        scope: z.string().describe('Worker scope (e.g., WORKSPACE, CLOUD).'),
        currentJobsCount: z
          .number()
          .describe('Number of active jobs currently running on this worker.'),
        toolName: z
          .string()
          .optional()
          .describe(
            'The specific security tool this worker is dedicated to, if any.',
          ),
        lastSeenAt: z
          .string()
          .describe('Timestamp of the last signal received from this worker.'),
      }),
    ),
  })
  async getWorkers(params: z.infer<typeof listWorkersSchema>) {
    const { workspaceId, limit, page } = params;
    const response = await this.workersService.getWorkers({
      limit: limit || 100,
      page: page || 1,
      workspaceId,
      sortBy: 'createdAt',
    });

    return {
      ...response,
      data: response.data.map((w) => {
        const isOnline =
          w.lastSeenAt &&
          Date.now() - new Date(w.lastSeenAt).getTime() < WORKER_TIMEOUT;
        return {
          id: w.id,
          name: `Worker-${w.id.slice(0, 8)}`,
          status: isOnline ? 'online' : 'offline',
          type: w.type,
          scope: w.scope,
          currentJobsCount: w.currentJobsCount || 0,
          toolName: w.tool?.name || 'General Purpose',
          lastSeenAt: w.lastSeenAt?.toISOString(),
        };
      }),
    };
  }

  @Tool({
    name: 'job_manager',
    description:
      'Lists background jobs and scan activities. Provides status, timing, priority, and technical context (tool, target). Use this when the user asks about "scans running", "job progress", or "what is the system doing". Keywords: jobs, scan progress, active tasks, failed scans.',
    parameters: listJobsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string().describe('The unique identifier of the job.'),
        toolName: z
          .string()
          .describe('The name of the security tool being executed.'),
        status: z
          .string()
          .describe(
            'Execution status (e.g., pending, in_progress, completed, failed).',
          ),
        priority: z
          .string()
          .describe('Job priority level (CRITICAL to BACKGROUND).'),
        targetValue: z
          .string()
          .optional()
          .describe('The asset value being scanned (e.g., domain or IP).'),
        retryCount: z
          .number()
          .describe('Number of times the job has been retried after failure.'),
        errorCount: z
          .number()
          .describe('Number of error logs recorded for this job.'),
        startedAt: z.string().optional().describe('When the job was created.'),
        finishedAt: z
          .string()
          .optional()
          .describe('When the job reached a terminal state.'),
        jobHistoryId: z
          .string()
          .optional()
          .describe('ID of the associated scan run history.'),
      }),
    ),
  })
  async listJobs(params: z.infer<typeof listJobsSchema>) {
    const { workspaceId, limit, page, jobHistoryId, jobStatus } = params;
    const response = await this.jobsRegistryService.getManyJobs({
      limit: limit || 100,
      page: page || 1,
      jobHistoryId: jobHistoryId,
      jobStatus,
      workspaceId,
      sortBy: 'createdAt',
    });

    return {
      ...response,
      data: response.data.map((j) => ({
        id: j.id,
        toolName: j.tool?.name || j.category,
        status: j.status,
        priority: j.priority,
        targetValue: j.asset?.value,
        retryCount: j.retryCount,
        errorCount: j.errorLogs?.length || 0,
        startedAt: j.createdAt?.toISOString(),
        finishedAt: j.completedAt?.toISOString() || j.updatedAt?.toISOString(),
        jobHistoryId: j.jobHistory?.id,
      })),
    };
  }
}
