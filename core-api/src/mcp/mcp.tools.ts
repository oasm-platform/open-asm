import { GET_WORKSPACE_MCP_TOOL_NAME } from '@/common/constants/app.constants';
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
import { IssueStatus } from '@/common/enums/enum';
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
      'Retrieve a list of accessible workspaces. Use this tool first to get the "workspaceId" required for almost all other tools.',
    outputSchema: z.object({
      workspaces: z
        .array(
          z.object({
            id: z.string().describe('The unique identifier of the workspace'),
            name: z
              .string()
              .describe('The human-readable name of the workspace'),
          }),
        )
        .describe('List of workspaces the user has access to'),
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
      'Search and list assets within a workspace. Assets are individual items like subdomains, IPs, or URLs found during scanning. Use this to explore the attack surface.',
    parameters: getAssetsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        value: z.string().describe('The asset value (e.g., domain, IP)'),
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
      'List security vulnerabilities identified in the workspace. Returns basic info like name and severity. Use "detail_vuln" for full technical details.',
    parameters: getVulnerabilitiesSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        name: z.string().describe('Name of the vulnerability'),
        severity: z
          .string()
          .describe('Severity level (CRITICAL, HIGH, MEDIUM, LOW, INFO)'),
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
      'List defined targets (root domains, IP ranges, CIDRs) that are being scanned. Targets are the starting points for discovery.',
    parameters: getTargetsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        value: z.string().describe('The target value (e.g., example.com)'),
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
      'Get high-level security metrics for the workspace: counts of assets, vulnerabilities by severity, and overall security score.',
    parameters: workspaceParamSchema,
    outputSchema: getStatisticOutPutSchema,
  })
  getStatistics({ workspaceId }: z.infer<typeof workspaceParamSchema>) {
    return this.statisticService.getStatistics({ workspaceId });
  }

  @Tool({
    name: 'detail_asset',
    description:
      'Retrieve comprehensive details for a specific asset, including detected technologies, open ports, and metadata.',
    parameters: detailAssetSchema,
    outputSchema: z.object({
      id: z.string(),
      value: z.string(),
      workspaceId: z.string(),
      targetId: z.string().nullable(),
      options: z.any().optional(),
      createdAt: z.date().or(z.string()),
      updatedAt: z.date().or(z.string()),
      technologies: z
        .array(z.any())
        .optional()
        .describe('List of detected technologies'),
    }),
  })
  async getAssetDetails(params: z.infer<typeof detailAssetSchema>) {
    const { workspaceId, assetId } = params;
    return this.assetsService.getAssetById(assetId, workspaceId);
  }

  @Tool({
    name: 'list_assets_in_target',
    description:
      'List all assets discovered under a specific target. Useful for narrowing down the scope to a single domain or network range.',
    parameters: listAssetsInTargetSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        value: z.string(),
        type: z.string().optional(),
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
      'Get full technical details of a vulnerability, including description, proof of concept (if available), remediation steps, and references.',
    parameters: detailVulnSchema,
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      severity: z.string(),
      description: z.string().optional(),
      remediation: z.string().optional(),
      proof: z.string().optional(),
      references: z.array(z.string()).optional(),
      createdAt: z.date().or(z.string()),
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
      'Search and filter operational issues or security tasks tracked in the system. Use this to find things like "SSL expired" or manual review tasks.',
    parameters: listIssuesSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        createdAt: z.date().or(z.string()),
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
      'Get detailed information about a specific issue, including its description, history, and status.',
    parameters: detailIssueSchema,
    outputSchema: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      status: z.string(),
      workspaceId: z.string(),
      comments: z.array(z.any()).optional(),
    }),
  })
  async getIssueDetails(params: z.infer<typeof detailIssueSchema>) {
    const { workspaceId, issueId } = params;
    return this.issuesService.getById(issueId, workspaceId);
  }

  @Tool({
    name: 'list_tools',
    description:
      'List available security tools installed in the workspace (e.g., nucleus, nmap, etc.) with their versions and status.',
    parameters: listToolsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        version: z.string().optional(),
        isInstalled: z.boolean().optional(),
      }),
    ),
  })
  async getTools(params: z.infer<typeof listToolsSchema>) {
    const { workspaceId, limit, page } = params;
    // q param is not supported by service yet
    return this.toolsService.getManyTools({
      limit: limit || 100,
      page: page || 1,
      workspaceId,
      sortBy: 'createdAt',
    });
  }

  @Tool({
    name: 'list_workers',
    description:
      'List registered worker nodes that execute scanning jobs. Check their status (online/offline) and current workload.',
    parameters: listWorkersSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        name: z.string().optional().describe('Worker name or ID'),
        status: z.string().optional().describe('Online status'),
        ip: z.string().optional(),
      }),
    ),
  })
  async getWorkers(params: z.infer<typeof listWorkersSchema>) {
    const { workspaceId, limit, page } = params;
    // q param is not supported by service yet
    return this.workersService.getWorkers({
      limit: limit || 100,
      page: page || 1,
      workspaceId,
      sortBy: 'createdAt',
    });
  }

  @Tool({
    name: 'job_manager',
    description:
      'View and manage background jobs. Use this to check the progress of scans, see failed jobs, or find running tasks.',
    parameters: listJobsSchema,
    outputSchema: getManyBaseResponseSchema(
      z.object({
        id: z.string(),
        name: z.string().describe('Name or type of the job'),
        status: z
          .string()
          .describe('Job status (completed, failed, active, etc.)'),
        progress: z.number().optional(),
        startedAt: z.date().or(z.string()).optional(),
        finishedAt: z.date().or(z.string()).optional(),
        jobHistoryId: z.string().optional(),
      }),
    ),
  })
  async listJobs(params: z.infer<typeof listJobsSchema>) {
    const { workspaceId, limit, page, jobHistoryId, jobStatus } = params;
    return this.jobsRegistryService.getManyJobs({
      limit: limit || 100,
      page: page || 1,
      jobHistoryId: jobHistoryId,
      jobStatus,
      workspaceId,
      sortBy: 'createdAt',
    });
  }
}
