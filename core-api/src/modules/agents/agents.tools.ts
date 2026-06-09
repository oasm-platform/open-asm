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
import { AgentsMemoriesService } from './agents.memories';
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
    private readonly agentsMemories: AgentsMemoriesService,
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
        try {
          // Log raw params for debugging
          console.log('[formulate_plan] Raw params:', JSON.stringify(params, null, 2));

          // Normalize steps: handle various formats AI might send
          let normalizedSteps: string[] = [];

          const rawSteps = params.steps as string[] | string;

          const cleanStep = (s: string): string => {
            let cleaned = s.trim();
            // Remove surrounding quotes (single or double)
            if (
              (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
              (cleaned.startsWith("'") && cleaned.endsWith("'"))
            ) {
              cleaned = cleaned.slice(1, -1).trim();
            }
            // Remove escaped quotes
            cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");
            // Remove extra whitespace but preserve intentional newlines
            cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();
            return cleaned;
          };

          // Try to parse as JSON array first (in case AI sends JSON string)
          let stepsArray: string[] = [];
          
          if (typeof rawSteps === 'string') {
            // Try JSON parse
            try {
              const parsed = JSON.parse(rawSteps);
              if (Array.isArray(parsed)) {
                stepsArray = parsed.map((s) => String(s));
                console.log('[formulate_plan] Parsed from JSON string');
              } else {
                // Single string - use as is
                stepsArray = [rawSteps];
              }
            } catch {
              // Not valid JSON, treat as plain string
              stepsArray = [rawSteps];
            }
          } else if (Array.isArray(rawSteps)) {
            // Check if it's a JSON string inside array (e.g., ["[\"step1\", \"step2\"]"])
            if (rawSteps.length === 1 && typeof rawSteps[0] === 'string') {
              const first = rawSteps[0];
              try {
                const parsed = JSON.parse(first);
                if (Array.isArray(parsed)) {
                  stepsArray = parsed.map((s) => String(s));
                  console.log('[formulate_plan] Parsed from nested JSON string');
                } else {
                  stepsArray = rawSteps;
                }
              } catch {
                stepsArray = rawSteps;
              }
            } else {
              stepsArray = rawSteps;
            }
          }

          console.log('[formulate_plan] Steps array:', stepsArray);

          // Clean each step
          for (const s of stepsArray) {
            if (typeof s === 'string' && s.trim()) {
              const cleaned = cleanStep(s);
              if (!cleaned) continue;

              // Split by newline in case AI puts all steps in one string
              if (cleaned.includes('\n')) {
                const lines = cleaned
                  .split('\n')
                  .map((l) => cleanStep(l))
                  .filter((l) => l.length > 0);
                normalizedSteps.push(...lines);
              } else {
                normalizedSteps.push(cleaned);
              }
            } else if (typeof s === 'object' && s !== null) {
              normalizedSteps.push(JSON.stringify(s));
            } else if (s !== null && s !== undefined) {
              const cleaned = cleanStep(String(s));
              if (cleaned) normalizedSteps.push(cleaned);
            }
          }

          console.log('[formulate_plan] Normalized steps:', normalizedSteps);
          console.log('[formulate_plan] Normalized count:', normalizedSteps.length);

          if (normalizedSteps.length === 0) {
            return { success: false, message: 'No valid steps provided.' };
          }

          const now = new Date().toISOString();
          const todos: AgentTodoItem[] = normalizedSteps.map((step) => ({
            id: randomUUID(), content: step, status: 'pending' as const, updatedAt: now,
          }));

          console.log('[formulate_plan] Final todos:', JSON.stringify(todos, null, 2));

          await repo.update(conversationId, { todos });
          if (emitter) emitter.emit('todos-updated', todos);
          return { success: true, message: `Plan set with ${todos.length} steps.`, todos };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[formulate_plan] Error:', error);
          return { success: false, message: `Failed to set plan: ${message}` };
        }
      },
    };

    const updateTodoStatusTool: any = {
      description: 'Update step status (pending/in_progress/completed/failed). Must call before moving to next step. Params: id (UUID), status.',
      parameters: z.object({
        id: z.string().uuid().describe('Todo item ID'),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed']).describe('New status'),
      }),
      execute: async (params: { id: string; status: AgentTodoItem['status'] }) => {
        try {
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
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to update step: ${message}` };
        }
      },
    };

    const addTodoTool: any = {
      description: 'Append a new step to the plan. Params: content (string).',
      parameters: z.object({
        content: z.string().min(1).describe('Todo content'),
      }),
      execute: async (params: { content: string }) => {
        try {
          const conversation = await repo.findOne({ where: { id: conversationId } });
          if (!conversation) return { success: false, message: 'Conversation not found' };

          const now = new Date().toISOString();
          const newTodo: AgentTodoItem = { id: randomUUID(), content: params.content, status: 'pending', updatedAt: now };
          const todos = [...(conversation.todos ?? []), newTodo];

          await repo.update(conversationId, { todos });
          if (emitter) emitter.emit('todos-updated', todos);
          return { success: true, message: `Added todo "${params.content}".`, todo: newTodo };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to add step: ${message}` };
        }
      },
    };

    const clearPlanTool: any = {
      description: 'Clear entire plan (irreversible). Then call formulate_plan to create a new one.',
      parameters: z.object({}),
      execute: async () => {
        try {
          await repo.update(conversationId, { todos: [] });
          if (emitter) emitter.emit('todos-updated', []);
          return { success: true, message: 'Plan cleared.' };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to clear plan: ${message}` };
        }
      },
    };

    return {
      formulate_plan: tool(setPlanTool),
      transition_step: tool(updateTodoStatusTool),
      append_step: tool(addTodoTool),
      scrap_plan: tool(clearPlanTool),
    };
  }

  getMemoryTools(
    workspaceId: string,
    conversationId: string,
  ): Record<string, ToolType> {
    const memoriesService = this.agentsMemories;

    const stmWriteTool: any = {
      description:
        'Save a key-value pair to short-term memory (conversation scope). ' +
        'Use this to remember important findings during execution (e.g., discovered IPs, scan results, target info).',
      parameters: z.object({
        key: z
          .string()
          .min(1)
          .describe(
            'Memory key (e.g. "target_info", "open_ports", "scan_results")',
          ),
        value: z.string().min(1).describe('Memory value to store'),
      }),
      execute: async (params: { key: string; value: string }) => {
        try {
          await memoriesService.stmSet(
            conversationId,
            params.key,
            params.value,
          );
          return {
            success: true,
            message: `Stored "${params.key}" in short-term memory.`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to store memory: ${message}` };
        }
      },
    };

    const stmReadTool: any = {
      description: 'Read a value from short-term memory by key.',
      parameters: z.object({
        key: z.string().describe('Memory key to read'),
      }),
      execute: async (params: { key: string }) => {
        try {
          const entry = await memoriesService.stmGet(
            conversationId,
            params.key,
          );
          if (!entry) {
            return {
              found: false,
              message: `No memory found for key "${params.key}".`,
            };
          }
          return {
            found: true,
            key: entry.key,
            value: entry.value,
            updatedAt: entry.updatedAt,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to read memory: ${message}` };
        }
      },
    };

    const stmListTool: any = {
      description: 'List all short-term memory entries for this conversation.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const entries = await memoriesService.stmGetAll(conversationId);
          return {
            count: entries.length,
            entries: entries.map((e) => ({
              key: e.key,
              value: e.value,
              updatedAt: e.updatedAt,
            })),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to list memories: ${message}` };
        }
      },
    };

    const ltmWriteTool: any = {
      description:
        'Save important information to long-term memory (workspace scope, persists across conversations). ' +
        'Use this for persistent knowledge like target profiles, known vulnerabilities, organizational policies.',
      parameters: z.object({
        content: z
          .string()
          .min(1)
          .describe('Content to store in long-term memory'),
      }),
      execute: async (params: { content: string }) => {
        try {
          await memoriesService.ltmSet(workspaceId, params.content);
          return {
            success: true,
            message: 'Saved to long-term memory.',
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to save LTM: ${message}` };
        }
      },
    };

    const ltmAppendTool: any = {
      description:
        'Append information to existing long-term memory (keeps previous content).',
      parameters: z.object({
        content: z
          .string()
          .min(1)
          .describe('Content to append to existing long-term memory'),
      }),
      execute: async (params: { content: string }) => {
        try {
          const existing = await memoriesService.ltmGet(workspaceId);
          const newContent = existing.content
            ? `${existing.content}\n\n${params.content}`
            : params.content;
          await memoriesService.ltmSet(workspaceId, newContent);
          return {
            success: true,
            message: 'Appended to long-term memory.',
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to append LTM: ${message}` };
        }
      },
    };

    const ltmReadTool: any = {
      description: 'Read the current long-term memory content.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const record = await memoriesService.ltmGet(workspaceId);
          return { content: record.content || '(empty)' };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to read LTM: ${message}` };
        }
      },
    };

    return {
      stm_write: tool(stmWriteTool),
      stm_read: tool(stmReadTool),
      stm_list: tool(stmListTool),
      ltm_write: tool(ltmWriteTool),
      ltm_append: tool(ltmAppendTool),
      ltm_read: tool(ltmReadTool),
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