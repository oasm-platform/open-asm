/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { tool } from 'ai';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Repository } from 'typeorm';
import { z } from 'zod';

import { AssetsService } from '@/modules/assets/assets.service';
import { IssuesService } from '@/modules/issues/issues.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import { WorkersService } from '@/modules/workers/workers.service';

import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { AgentMode } from '@/common/enums/enum';
import {
  detailAssetSchema,
  detailIssueSchema,
  detailVulnSchema,
  getAssetsSchema,
  getPortsSchema,
  getStatisticOutPutSchema,
  getTargetsSchema,
  getTechnologiesSchema,
  getTlsSchema,
  getVulnerabilitiesSchema,
  listAssetsInTargetSchema,
  listIssuesSchema,
  listJobsSchema,
  listToolsSchema,
  listWorkersSchema,
} from '@/mcp/mcp.schema';
import type { AgentTodoItem } from './agents.todo';
import { AgentConversation } from './entities/agent-conversation.entity';

const webFetchSchema = z.object({
  url: z.string().url().describe('Target URL'),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolType = any;

@Injectable()
export class AgentTool {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly targetsService: TargetsService,
    @Inject(forwardRef(() => VulnerabilitiesService))
    private readonly vulnerabilitiesService: VulnerabilitiesService,
    private readonly statisticService: StatisticService,
    @Inject(forwardRef(() => IssuesService))
    private readonly issuesService: IssuesService,
    @Inject(forwardRef(() => ToolsService))
    private readonly toolsService: ToolsService,
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WorkersService,
    @Inject(forwardRef(() => JobsRegistryService))
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly remoteExecuteService: RemoteExecuteService,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
  ) {}

  get getAssetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List discovered assets (domains, IPs, URLs) in the workspace. Params: page, limit, value (filter text).',
        parameters: getAssetsSchema,
        execute: async (params: z.infer<typeof getAssetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.assetsService.getManyAsssetServices(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, value },
            workspaceId,
          );
          return { ...response, data: response.data.map((i) => ({ id: i.id, value: i.value })) };
        },
      };
      return tool(toolConfig);
    };
  }

  get getVulnerabilitiesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List security vulnerabilities with severity. Params: page, limit, q (search e.g. "XSS", "CVE-2024").',
        parameters: getVulnerabilitiesSchema,
        execute: async (params: z.infer<typeof getVulnerabilitiesSchema>) => {
          const { page, limit, q } = params;
          const response = await this.vulnerabilitiesService.getVulnerabilities(
            { limit: limit ?? 100, page: page ?? 1, q, sortBy: 'createdAt', sortOrder: SortOrder.DESC },
            workspaceId,
          );
          return { ...response, data: response.data.map((i) => ({ id: i.id, name: i.name, severity: i.severity })) };
        },
      };
      return tool(toolConfig);
    };
  }

  get getTargetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Show scanning scope (root domains, IP ranges added by user). Params: page, limit, value (filter text).',
        parameters: getTargetsSchema,
        execute: async (params: z.infer<typeof getTargetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.targetsService.getTargetsInWorkspace(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, value },
            workspaceId,
          );
          return { ...response, data: response.data.map((i) => ({ id: i.id, value: i.value })) };
        },
      };
      return tool(toolConfig);
    };
  }

  get getStatisticsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'Return security dashboard summary: asset/vulnerability counts, severity breakdown, security score. No params.',
        parameters: getStatisticOutPutSchema,
        execute: async () => this.statisticService.getStatistics({ workspaceId }),
      };
      return tool(toolConfig);
    };
  }

  get detailAssetTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'Get full technical details of a single asset by assetId.',
        parameters: detailAssetSchema,
        execute: async (params: z.infer<typeof detailAssetSchema>) => {
          const { assetId } = params;
          return this.assetsService.getAssetById(assetId, workspaceId);
        },
      };
      return tool(toolConfig);
    };
  }

  get listAssetsInTargetTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List assets discovered from a specific target by targetId. Params: targetId, page, limit, value (filter).',
        parameters: listAssetsInTargetSchema,
        execute: async (params: z.infer<typeof listAssetsInTargetSchema>) => {
          const { targetId, limit, page, value } = params;
          return this.assetsService.getManyAsssetServices(
            { limit: limit ?? 100, page: page ?? 1, targetIds: [targetId], value, sortBy: 'createdAt', sortOrder: SortOrder.DESC },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  get detailVulnTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'Get full vulnerability report with CVSS, PoC, remediation steps. Params: vulnId.',
        parameters: detailVulnSchema,
        execute: async (params: z.infer<typeof detailVulnSchema>) => {
          const vulnId: string = (params.vulnId ?? params.id) as string;
          return this.vulnerabilitiesService.getVulnerability(vulnId, workspaceId);
        },
      };
      return tool(toolConfig);
    };
  }

  get getPortsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List open network ports with asset counts. Params: page, limit, value (port number filter).',
        parameters: getPortsSchema,
        execute: async (params: z.infer<typeof getPortsSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getPortAssets(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, value },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  get getTechnologiesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List detected technologies (software, frameworks, servers). Params: page, limit, value (filter by name).',
        parameters: getTechnologiesSchema,
        execute: async (params: z.infer<typeof getTechnologiesSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getTechnologyAssets(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, value },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  get getTlsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List TLS/SSL certificates with issuer, subject, expiry. Params: page, limit, search (host name filter).',
        parameters: getTlsSchema,
        execute: async (params: z.infer<typeof getTlsSchema>) => {
          const { page, limit, search } = params;
          return this.assetsService.getManyTls(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'not_after', sortOrder: SortOrder.ASC, search },
            workspaceId,
          );
        },
      };
      return tool(toolConfig);
    };
  }

  get webFetchTool(): (workspaceId: string) => any {
    return (_workspaceId: string) => {
      const toolConfig: any = {
        description: 'HTTP GET to any public URL. Returns statusCode + body. Params: url.',
        parameters: webFetchSchema,
        execute: async (params: z.infer<typeof webFetchSchema>) => {
          const { url } = params;
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'User-Agent': 'OASM-Security-Agent/1.0' },
            });
            return { statusCode: response.status, body: await response.text() };
          } catch (error) {
            return { error: error instanceof Error ? error.message : 'Unknown error', url };
          }
        },
      };
      return tool(toolConfig);
    };
  }

  get listIssuesTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List security issues with status. Params: page, limit, search, status (OPEN/IN_PROGRESS/RESOLVED).',
        parameters: listIssuesSchema,
        execute: async (params: z.infer<typeof listIssuesSchema>) => {
          const { page, limit, search, status } = params;
          const response = await this.issuesService.getMany(
            { limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, search, status: status as any },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, title: i.title, status: i.status, tags: i.tags })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  get detailIssueTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'Get full details of a single issue by issueId.',
        parameters: detailIssueSchema,
        execute: async (params: z.infer<typeof detailIssueSchema>) => {
          const { issueId } = params;
          return this.issuesService.getById(issueId, workspaceId);
        },
      };
      return tool(toolConfig);
    };
  }

  get listToolsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'List installed security tools/scanners. Params: page, limit, q (search filter).',
        parameters: listToolsSchema,
        execute: async (params: z.infer<typeof listToolsSchema>) => {
          const { page, limit, q } = params;
          const response = await this.toolsService.getManyTools({
            limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, search: q,
          });
          return { ...response, data: response.data.map((i) => ({ id: i.id, name: i.name })) };
        },
      };
      return tool(toolConfig);
    };
  }

  get listWorkersTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'List connected worker nodes. Params: page, limit, q (search query).',
        parameters: listWorkersSchema,
        execute: async (params: z.infer<typeof listWorkersSchema>) => {
          const { page, limit, q } = params;
          const response = await this.workersService.getWorkers({
            limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC, search: q,
            workspaceId, enabledAgentMode: true,
          });
          return { ...response, data: response.data.map((i) => ({ id: i.id, name: i.name })) };
        },
      };
      return tool(toolConfig);
    };
  }

  get listJobsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List background scan jobs with status. Params: page, limit, jobHistoryId, jobStatus (completed/failed/active).',
        parameters: listJobsSchema,
        execute: async (params: z.infer<typeof listJobsSchema>) => {
          const { page, limit, jobHistoryId, jobStatus } = params;
          const response = await this.jobsRegistryService.getManyJobs({
            limit: limit ?? 100, page: page ?? 1, sortBy: 'createdAt', sortOrder: SortOrder.DESC,
            jobHistoryId, jobStatus,
          });
          return { ...response, data: response.data.map((i) => ({ id: i.id, status: i.status })) };
        },
      };
      return tool(toolConfig);
    };
  }

  remoteExecuteTool(workspaceId: string, conversationId: string, emitter?: EventEmitter): ToolType {
    const toolConfig: any = {
      description: [
        'Execute arbitrary shell commands on remote worker nodes (nmap, curl, dig, etc.).',
        'Params: command (required shell command string).',
        'Output: stdout, stderr, exitCode, error, timedOut.',
        'Warning: OS-level permissions, no PTY, strict timeout.',
      ].join('\n'),
      parameters: z.object({
        command: z.string().min(1).describe('Shell command to execute'),
      }),
      execute: async (
        params: { command: string },
        options: { toolCallId: string },
      ) => {
        const { command } = params;
        const { toolCallId } = options;
        const sessionId = randomUUID();

        return this.remoteExecuteService.waitForResult(
          command,
          sessionId,
          conversationId,
          60_000,
          (event) => {
            if (emitter) {
              emitter.emit('remote-execute-output', { toolCallId, ...event });
            }
          },
        );
      },
    };
    return tool(toolConfig);
  }

  getTodoTools(
    conversationId: string,
    emitter?: EventEmitter,
  ): Record<string, ToolType> {
    const repo = this.conversationRepository;

    const setPlanTool: any = {
      description: 'Set/reset execution plan with step array. Params: steps (string[]). Output: success, message, todos.',
      parameters: z.object({
        steps: z.array(z.string().min(1)).min(1).describe('Plan steps'),
      }),
      execute: async (params: { steps: string[] }) => {
        const now = new Date().toISOString();
        const todos: AgentTodoItem[] = params.steps.map((step) => ({
          id: randomUUID(), content: step, status: 'pending' as const, updatedAt: now,
        }));
        await repo.update(conversationId, { todos });
        if (emitter) emitter.emit('todos-updated', todos);
        return { success: true, message: `Plan set with ${todos.length} steps.`, todos };
      },
    };

    const updateTodoStatusTool: any = {
      description: 'Update step status (pending/in_progress/completed/failed). Must call before moving to next step. Params: id (UUID), status.',
      parameters: z.object({
        id: z.string().uuid().describe('Todo item ID'),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed']).describe('New status'),
      }),
      execute: async (params: { id: string; status: AgentTodoItem['status'] }) => {
        const conversation = await repo.findOne({ where: { id: conversationId } });
        if (!conversation) return { success: false, message: 'Conversation not found' };

        const targetTodo = (conversation.todos ?? []).find((t) => t.id === params.id);
        if (!targetTodo) return { success: false, message: `Todo "${params.id}" not found.` };

        const todos = (conversation.todos ?? []).map((t) =>
          t.id === params.id ? { ...t, status: params.status, updatedAt: new Date().toISOString() } : t,
        );
        await repo.update(conversationId, { todos });
        if (emitter) emitter.emit('todos-updated', todos);
        return { success: true, message: `Updated "${targetTodo.content}" -> ${params.status}`, todo: todos.find((t) => t.id === params.id) };
      },
    };

    const addTodoTool: any = {
      description: 'Append a new step to the plan. Params: content (string).',
      parameters: z.object({
        content: z.string().min(1).describe('Todo content'),
      }),
      execute: async (params: { content: string }) => {
        const conversation = await repo.findOne({ where: { id: conversationId } });
        if (!conversation) return { success: false, message: 'Conversation not found' };

        const now = new Date().toISOString();
        const newTodo: AgentTodoItem = { id: randomUUID(), content: params.content, status: 'pending', updatedAt: now };
        const todos = [...(conversation.todos ?? []), newTodo];

        await repo.update(conversationId, { todos });
        if (emitter) emitter.emit('todos-updated', todos);
        return { success: true, message: `Added todo "${params.content}".`, todo: newTodo };
      },
    };

    const clearPlanTool: any = {
      description: 'Clear entire plan (irreversible). Then call formulate_plan to create a new one.',
      parameters: z.object({}),
      execute: async () => {
        await repo.update(conversationId, { todos: [] });
        if (emitter) emitter.emit('todos-updated', []);
        return { success: true, message: 'Plan cleared.' };
      },
    };

    return {
      formulate_plan: tool(setPlanTool),
      transition_step: tool(updateTodoStatusTool),
      append_step: tool(addTodoTool),
      scrap_plan: tool(clearPlanTool),
    };
  }

  getTools(
    workspaceId: string,
    agentMode: AgentMode,
    emitter?: EventEmitter,
    conversationId?: string,
  ): Record<string, ToolType> {
    const { AGENT, ASK } = AgentMode;
    const tools: Record<string, { method: ToolType; permissions: AgentMode[] }> = {
      enumerate_assets: { method: this.getAssetsTool(workspaceId), permissions: [AGENT, ASK] },
      discover_vulnerabilities: { method: this.getVulnerabilitiesTool(workspaceId), permissions: [AGENT, ASK] },
      retrieve_targets: { method: this.getTargetsTool(workspaceId), permissions: [AGENT, ASK] },
      gather_statistics: { method: this.getStatisticsTool(workspaceId), permissions: [AGENT, ASK] },
      inspect_asset: { method: this.detailAssetTool(workspaceId), permissions: [AGENT, ASK] },
      examine_target_assets: { method: this.listAssetsInTargetTool(workspaceId), permissions: [AGENT, ASK] },
      investigate_vulnerability: { method: this.detailVulnTool(workspaceId), permissions: [AGENT, ASK] },
      list_network_ports: { method: this.getPortsTool(workspaceId), permissions: [AGENT, ASK] },
      fingerprint_technologies: { method: this.getTechnologiesTool(workspaceId), permissions: [AGENT, ASK] },
      verify_tls_settings: { method: this.getTlsTool(workspaceId), permissions: [AGENT, ASK] },
      retrieve_web_page: { method: this.webFetchTool(workspaceId), permissions: [AGENT, ASK] },
      enumerate_open_issues: { method: this.listIssuesTool(workspaceId), permissions: [AGENT, ASK] },
      inspect_issue: { method: this.detailIssueTool(workspaceId), permissions: [AGENT, ASK] },
      display_available_tools: { method: this.listToolsTool(workspaceId), permissions: [AGENT, ASK] },
      list_active_workers: { method: this.listWorkersTool(workspaceId), permissions: [AGENT, ASK] },
      review_jobs: { method: this.listJobsTool(workspaceId), permissions: [AGENT, ASK] },
      execute_remote_command: { method: this.remoteExecuteTool(workspaceId, conversationId ?? '', emitter), permissions: [AGENT] },
    };

    return Object.fromEntries(
      Object.entries(tools)
        .filter(([, config]) => config.permissions.includes(agentMode))
        .map(([key, config]) => [key, config.method]),
    ) as Record<string, ToolType>;
  }
}