/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import type { WrapperType } from '@/common/types/app.types';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { tool } from 'ai';
import { randomUUID } from 'node:crypto';
import * as dns from 'node:dns/promises';
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
import {
  AgentsApprovalsService,
  type ApprovalContext,
  type ApprovalDecision,
  type ApprovalSettings,
  type PlanRunMode,
} from './agents.approvals';
import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
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
import { AgentsMemoriesService } from './agents.memories';
import type { AgentTodoItem } from './agents.todo';
import { AgentConversationTodo } from './entities/agent-conversation-todo.entity';
import { AgentConversation } from './entities/agent-conversation.entity';

const webFetchSchema = z.object({
  url: z.string().url().describe('Target URL'),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolType = any;

function rejectionMessage(what: string, feedback?: string): string {
  const base = `${what} was not approved by the user and was not executed.`;
  return feedback ? `${base} The user says: ${feedback}` : base;
}

/** Matched by the console (chat-helpers.tsx) to show the call as "Needs plan" */
const PLAN_REQUIRED_MESSAGE =
  'Not executed: this conversation needs an approved plan first. Call formulate_plan with the full plan (put this work in its steps) and wait for the user to approve it before calling other tools.';

/** Plans exist only in PLAN mode; AUTO and MANUAL just do the work. */
const PLANNING_OFF_MESSAGE =
  'Not executed: planning is off in this conversation (only plan mode makes plans). Do the work directly with the other tools, without a plan.';

function deniedMessage(what: string, decision: ApprovalDecision): string {
  return decision.planRequired
    ? PLAN_REQUIRED_MESSAGE
    : rejectionMessage(what, decision.feedback);
}

/** Tools that gate themselves (on the raw command) instead of via withApproval. */
const SELF_GATED_TOOLS = new Set(['execute_remote_command']);

/**
 * Built-in tools that only read OASM data, so MANUAL runs them without
 * asking. Not retrieve_web_page: a URL it fetches can carry data out.
 */
const READ_ONLY_TOOLS = new Set([
  'enumerate_assets',
  'discover_vulnerabilities',
  'retrieve_targets',
  'gather_statistics',
  'inspect_asset',
  'examine_target_assets',
  'investigate_vulnerability',
  'list_network_ports',
  'fingerprint_technologies',
  'verify_tls_settings',
  'enumerate_open_issues',
  'inspect_issue',
  'display_available_tools',
  'list_active_workers',
  'review_jobs',
]);

/**
 * An MCP tool counts as read-only when its server says so and does not say
 * it reaches the outside world (same reason as retrieve_web_page).
 */
function isReadOnlyMcpTool(metadata: unknown): boolean {
  const annotations = (metadata as { annotations?: Record<string, unknown> })
    ?.annotations;
  return (
    annotations?.readOnlyHint === true && annotations.openWorldHint !== true
  );
}

/**
 * JSON with object keys sorted at every level, so the same arguments match
 * the same approval whatever order the model wrote them in.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** Longer plans are rarely followed through and bloat every system prompt. */
const MAX_PLAN_STEPS = 20;

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

@Injectable()
export class AgentTool {
  private readonly logger = new Logger(AgentTool.name);

  constructor(
    private readonly assetsService: AssetsService,
    private readonly targetsService: TargetsService,
    @Inject(forwardRef(() => VulnerabilitiesService))
    private readonly vulnerabilitiesService: WrapperType<VulnerabilitiesService>,
    private readonly statisticService: StatisticService,
    @Inject(forwardRef(() => IssuesService))
    private readonly issuesService: WrapperType<IssuesService>,
    @Inject(forwardRef(() => ToolsService))
    private readonly toolsService: WrapperType<ToolsService>,
    @Inject(forwardRef(() => WorkersService))
    private readonly workersService: WrapperType<WorkersService>,
    @Inject(forwardRef(() => JobsRegistryService))
    private readonly jobsRegistryService: WrapperType<JobsRegistryService>,
    private readonly remoteExecuteService: RemoteExecuteService,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentConversationTodo)
    private readonly todoRepository: Repository<AgentConversationTodo>,
    private readonly agentsMemories: AgentsMemoriesService,
    private readonly approvals: AgentsApprovalsService,
  ) {}

  get getAssetsTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List discovered assets (domains, IPs, URLs) in the workspace. Params: page, limit, value (filter text).',
        inputSchema: getAssetsSchema,
        execute: async (params: z.infer<typeof getAssetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, value: i.value })),
          };
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
        inputSchema: getVulnerabilitiesSchema,
        execute: async (params: z.infer<typeof getVulnerabilitiesSchema>) => {
          const { page, limit, q } = params;
          const response = await this.vulnerabilitiesService.getVulnerabilities(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              q,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              name: i.name,
              severity: i.severity,
            })),
          };
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
        inputSchema: getTargetsSchema,
        execute: async (params: z.infer<typeof getTargetsSchema>) => {
          const { page, limit, value } = params;
          const response = await this.targetsService.getTargetsInWorkspace(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, value: i.value })),
          };
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
        inputSchema: z.object({}),
        execute: async () =>
          this.statisticService.getStatistics({ workspaceId }),
      };
      return tool(toolConfig);
    };
  }

  get detailAssetTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description: 'Get full technical details of a single asset by assetId.',
        inputSchema: detailAssetSchema,
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
        inputSchema: listAssetsInTargetSchema,
        execute: async (params: z.infer<typeof listAssetsInTargetSchema>) => {
          const { targetId, limit, page, value } = params;
          return this.assetsService.getManyAsssetServices(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              targetIds: [targetId],
              value,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
            },
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
        description:
          'Get full vulnerability report with CVSS, PoC, remediation steps. Params: vulnId.',
        inputSchema: detailVulnSchema,
        execute: async (params: z.infer<typeof detailVulnSchema>) => {
          const vulnId: string = (params.vulnId ?? params.id) as string;
          return this.vulnerabilitiesService.getVulnerability(
            vulnId,
            workspaceId,
          );
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
        inputSchema: getPortsSchema,
        execute: async (params: z.infer<typeof getPortsSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getPortAssets(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
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
        inputSchema: getTechnologiesSchema,
        execute: async (params: z.infer<typeof getTechnologiesSchema>) => {
          const { page, limit, value } = params;
          return this.assetsService.getTechnologyAssets(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              value,
            },
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
        inputSchema: getTlsSchema,
        execute: async (params: z.infer<typeof getTlsSchema>) => {
          const { page, limit, search } = params;
          return this.assetsService.getManyTls(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'not_after',
              sortOrder: SortOrder.ASC,
              search,
            },
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
        description:
          'HTTP GET to any public URL. Returns statusCode + body. Params: url.',
        inputSchema: webFetchSchema,
        execute: async (params: z.infer<typeof webFetchSchema>) => {
          const { url: rawUrl } = params;
          try {
            const parsedUrl = new URL(rawUrl);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
              return { error: 'Only http and https protocols are allowed', url: rawUrl };
            }
            const addresses = await dns.resolve4(parsedUrl.hostname);
            for (const ip of addresses) {
              if (isPrivateIp(ip)) {
                return { error: 'Request blocked: target address is not publicly accessible', url: rawUrl };
              }
            }
            const response = await fetch(rawUrl, {
              method: 'GET',
              headers: { 'User-Agent': 'OASM-Security-Agent/1.0' },
            });
            return { statusCode: response.status, body: await response.text() };
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : 'Unknown error',
              url: rawUrl,
            };
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
        inputSchema: listIssuesSchema,
        execute: async (params: z.infer<typeof listIssuesSchema>) => {
          const { page, limit, search, status } = params;
          const response = await this.issuesService.getMany(
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              search,
              status: status as any,
            },
            workspaceId,
          );
          return {
            ...response,
            data: response.data.map((i) => ({
              id: i.id,
              title: i.title,
              status: i.status,
              tags: i.tags,
            })),
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
        inputSchema: detailIssueSchema,
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
        description:
          'List installed security tools/scanners. Params: page, limit, q (search filter).',
        inputSchema: listToolsSchema,
        execute: async (params: z.infer<typeof listToolsSchema>) => {
          const { page, limit, q } = params;
          const response = await this.toolsService.getManyTools({
            limit: limit ?? 100,
            page: page ?? 1,
            sortBy: 'createdAt',
            sortOrder: SortOrder.DESC,
            search: q,
          });
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, name: i.name })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  get listWorkersTool(): (workspaceId: string) => any {
    return (workspaceId: string) => {
      const toolConfig: any = {
        description:
          'List connected worker nodes. Params: page, limit, q (search query).',
        inputSchema: listWorkersSchema,
        execute: async (params: z.infer<typeof listWorkersSchema>) => {
          const { page, limit, q } = params;
          const response = await this.workersService.getWorkers({
            limit: limit ?? 100,
            page: page ?? 1,
            sortBy: 'createdAt',
            sortOrder: SortOrder.DESC,
            search: q,
            workspaceId,
            enabledAgentMode: true,
          });
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, name: i.name })),
          };
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
        inputSchema: listJobsSchema,
        execute: async (params: z.infer<typeof listJobsSchema>) => {
          const { page, limit, jobHistoryId, jobStatus } = params;
          const response = await this.jobsRegistryService.getManyJobs(
            workspaceId,
            {
              limit: limit ?? 100,
              page: page ?? 1,
              sortBy: 'createdAt',
              sortOrder: SortOrder.DESC,
              jobHistoryId,
              jobStatus,
            },
          );
          return {
            ...response,
            data: response.data.map((i) => ({ id: i.id, status: i.status })),
          };
        },
      };
      return tool(toolConfig);
    };
  }

  remoteExecuteTool(
    workspaceId: string,
    conversationId: string,
    emitter?: EventEmitter,
    approval?: ApprovalSettings,
  ): ToolType {
    const toolConfig: any = {
      description: [
        'Execute arbitrary shell commands on remote worker nodes (nmap, curl, dig, etc.).',
        'Params: command (required shell command string).',
        'Output: stdout, stderr, exitCode, error, timedOut.',
        'Warning: OS-level permissions, no PTY, strict timeout.',
        'The user may reject a command; if so, do not retry it and propose an alternative.',
      ].join('\n'),
      inputSchema: z.object({
        command: z.string().min(1).describe('Shell command to execute'),
      }),
      execute: async (
        params: { command: string },
        options: { toolCallId: string; abortSignal?: AbortSignal },
      ) => {
        const { command } = params;
        const { toolCallId } = options;
        const sessionId = randomUUID();

        // Without an approval context (e.g. system-driven runs) nobody can
        // approve, so refuse rather than run unreviewed commands.
        const decision = approval
          ? await this.approvals.authorize(
              command,
              toolCallId,
              { ...approval, workspaceId, conversationId },
              emitter,
              {
                tool: 'execute_remote_command',
                description: 'Run a shell command on a connected worker',
              },
              options.abortSignal,
            )
          : ({ allowed: false } satisfies ApprovalDecision);
        if (!decision.allowed) {
          return {
            id: sessionId,
            command,
            stdout: '',
            stderr: '',
            exitCode: null,
            error: deniedMessage('Command', decision),
            timedOut: false,
          };
        }

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

  /**
   * Plan tools. With `plan.approval` in PLAN mode, formulate_plan shows the
   * new plan to the user and waits for them to approve it, choosing whether
   * the rest of the run asks per command (MANUAL) or not (AUTO). Outside
   * PLAN mode formulate_plan and append_step refuse: only transition_step and
   * scrap_plan remain, to finish or drop a plan approved earlier.
   */
  getTodoTools(
    conversationId: string,
    emitter?: EventEmitter,
    plan?: { workspaceId: string; approval: ApprovalSettings },
  ): Record<string, ToolType> {
    const todoRepo = this.todoRepository;

    /**
     * Tries to parse a string as a JSON array with fallback strategies.
     * Handles cases where LLM sends steps with invalid JSON escapes (e.g., \`)
     * that cause JSON.parse to fail.
     *
     * Strategy:
     * 1. Normal JSON.parse
     * 2. Sanitize invalid escapes and retry
     * 3. Regex extraction for ["...", "..."] patterns
     */
    const tryParseJsonArray = (str: string): string[] | null => {
      // Strategy 1: Normal JSON.parse
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map((s) => String(s));
        return null;
      } catch {
        // Fall through
      }

      // Strategy 2: Sanitize invalid escapes and retry
      // Common issue: LLM sends \` which is not valid JSON
      try {
        const sanitized = str.replace(/\\`/g, '`');
        const parsed = JSON.parse(sanitized);
        if (Array.isArray(parsed)) return parsed.map((s) => String(s));
        return null;
      } catch {
        // Fall through
      }

      // Strategy 3: Regex extraction for ["...", "..."] pattern
      const trimmed = str.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const inner = trimmed.slice(1, -1);
        const items: string[] = [];
        let current = '';
        let inQuote = false;
        let escaped = false;

        for (let i = 0; i < inner.length; i++) {
          const ch = inner[i]!;
          if (escaped) {
            current += ch;
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            current += ch;
            continue;
          }
          if (ch === '"') {
            inQuote = !inQuote;
            continue;
          }
          if (ch === ',' && !inQuote) {
            const trimmedItem = current.trim();
            if (trimmedItem) items.push(trimmedItem);
            current = '';
            continue;
          }
          current += ch;
        }
        const lastItem = current.trim();
        if (lastItem) items.push(lastItem);

        if (items.length > 0) {
          // Clean up escaped quotes in each item
          return items.map((s) =>
            s.replace(/^"|"$/g, '').replace(/\\"/g, '"').trim(),
          );
        }
      }

      return null;
    };

    const getAllTodos = async (): Promise<AgentTodoItem[]> => {
      const entities = await todoRepo.find({
        where: { conversationId },
        order: { sortOrder: 'ASC' },
      });
      return entities.map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
        sortOrder: t.sortOrder,
        updatedAt: t.updatedAt.toISOString(),
      }));
    };

    const emitTodos = async (): Promise<void> => {
      if (emitter) {
        const todos = await getAllTodos();
        emitter.emit('todos-updated', todos);
      }
    };

    // Read at call time: approving a plan switches the run out of PLAN mode,
    // and the plan it approved is the last one this run may make
    const planningAllowed = () =>
      !plan || plan.approval.mode === AgentApprovalMode.PLAN;

    const setPlanTool: any = {
      description:
        'Set/reset execution plan with step array. Params: steps (string[]). Output: success, message, todos. ONLY call this when no active plan exists (all steps completed/failed, or plan is empty). If a plan is already in progress, you MUST execute existing steps — do NOT call this tool.',
      inputSchema: z.object({
        steps: z.array(z.string().min(1)).min(1).describe('Plan steps'),
      }),
      execute: async (
        params: { steps: string[] },
        options?: { toolCallId?: string; abortSignal?: AbortSignal },
      ) => {
        if (!planningAllowed()) {
          return { success: false, message: PLANNING_OFF_MESSAGE };
        }
        try {
          // Guard: reject if there are active (pending/in_progress) todos
          const existingTodos = await todoRepo.find({
            where: { conversationId },
            order: { sortOrder: 'ASC' },
          });
          const hasActiveTodos = existingTodos.some(
            (t) => t.status === 'pending' || t.status === 'in_progress',
          );
          if (hasActiveTodos) {
            const activeSteps = existingTodos
              .filter(
                (t) => t.status === 'pending' || t.status === 'in_progress',
              )
              .map((t) => `  - [${t.status}] ${t.content}`)
              .join('\n');
            return {
              success: false,
              message:
                `REJECTED: A plan is already in progress with ${existingTodos.filter((t) => t.status !== 'completed' && t.status !== 'failed').length} pending step(s).\n` +
                `Active steps:\n${activeSteps}\n\n` +
                'You MUST execute the existing steps first. Do NOT create a new plan while steps are pending. ' +
                'Use transition_step(id, "in_progress") to start the first pending step.',
            };
          }

          this.logger.debug(
            '[formulate_plan] Raw params: ' + JSON.stringify(params),
          );

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

          let stepsArray: string[] = [];

          if (typeof rawSteps === 'string') {
            const parsed = tryParseJsonArray(rawSteps);
            if (parsed) {
              stepsArray = parsed;
              this.logger.debug('[formulate_plan] Parsed from JSON string');
            } else {
              stepsArray = [rawSteps];
            }
          } else if (Array.isArray(rawSteps)) {
            if (rawSteps.length === 1 && typeof rawSteps[0] === 'string') {
              const parsed = tryParseJsonArray(rawSteps[0]!);
              if (parsed) {
                stepsArray = parsed;
                this.logger.debug(
                  '[formulate_plan] Parsed from nested JSON string',
                );
              } else {
                stepsArray = rawSteps;
              }
            } else {
              stepsArray = rawSteps;
            }
          }


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

          if (normalizedSteps.length === 0) {
            return { success: false, message: 'No valid steps provided.' };
          }
          if (normalizedSteps.length > MAX_PLAN_STEPS) {
            return {
              success: false,
              message: `Too many steps (${normalizedSteps.length}). Keep the plan to at most ${MAX_PLAN_STEPS} steps by merging related work.`,
            };
          }

          // Replace the old plan atomically: a failed insert must not leave
          // the conversation with no plan at all
          await todoRepo.manager.transaction(async (manager) => {
            const repo = manager.getRepository(AgentConversationTodo);
            await repo.delete({ conversationId });
            await repo.save(
              normalizedSteps.map((step, index) =>
                repo.create({
                  conversationId,
                  content: step,
                  status: 'pending' as const,
                  sortOrder: index,
                }),
              ),
            );
          });

          const todos = await getAllTodos();
          this.logger.debug(
            `[formulate_plan] Plan set with ${todos.length} steps for ${conversationId}`,
          );

          // Show the plan right away, also while the user reviews it
          await emitTodos();

          if (plan?.approval.mode === AgentApprovalMode.PLAN) {
            const decision = await this.approvals.requestPlanApproval(
              normalizedSteps,
              options?.toolCallId ?? '',
              { ...plan.approval, workspaceId: plan.workspaceId, conversationId },
              emitter,
              options?.abortSignal,
            );
            if (!decision.allowed) {
              await todoRepo.delete({ conversationId });
              await emitTodos();
              return {
                success: false,
                error: rejectionMessage('The plan', decision.feedback),
                message: decision.feedback
                  ? 'The plan was discarded. Revise it following what the user said, then call formulate_plan again.'
                  : 'The plan was discarded. Do not run it; ask the user how they want to proceed.',
              };
            }
            const mode = decision.mode ?? AgentApprovalMode.MANUAL;
            await this.switchApprovalMode(
              conversationId,
              plan.approval,
              mode,
              emitter,
            );
            return {
              success: true,
              message:
                `The user approved this ${todos.length}-step plan` +
                (mode === AgentApprovalMode.AUTO
                  ? ' and lets it run without asking.'
                  : '; each command still asks for approval.') +
                ' Start with step 1 now.',
              todos,
            };
          }

          return {
            success: true,
            message: `Plan set with ${todos.length} steps.`,
            todos,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`[formulate_plan] Error: ${message}`);
          return { success: false, message: `Failed to set plan: ${message}` };
        }
      },
    };

    const updateTodoStatusTool: any = {
      description:
        'Update the status of a specific step in the execution plan. You MUST call this at two points: (1) BEFORE starting work on a step — call transition_step(id, "in_progress"), and (2) AFTER finishing work on a step — call transition_step(id, "completed") or transition_step(id, "failed"). ALWAYS transition the current step before moving to the next sequential step. NEVER skip steps. NEVER call this for a step that is not your current step. Params: id (UUID of the step), status (pending/in_progress/completed/failed).',
      inputSchema: z.object({
        id: z.string().uuid().describe('Todo item ID'),
        status: z
          .enum(['pending', 'in_progress', 'completed', 'failed'])
          .describe('New status'),
      }),
      execute: async (params: {
        id: string;
        status: AgentTodoItem['status'];
      }) => {
        try {
          const targetTodo = await todoRepo.findOne({
            where: { id: params.id, conversationId },
          });
          if (!targetTodo)
            return {
              success: false,
              message: `Todo "${params.id}" not found.`,
            };

          // Server-side ordering guard: enforce sequential execution
          if (params.status === 'in_progress') {
            // Only the first pending/in_progress step (by sortOrder) may be started
            const allTodos = await todoRepo.find({
              where: { conversationId },
              order: { sortOrder: 'ASC' },
            });
            const currentStep = allTodos.find(
              (t) => t.status === 'pending' || t.status === 'in_progress',
            );
            if (currentStep && currentStep.id !== targetTodo.id) {
              return {
                success: false,
                message: `REJECTED: Cannot start "${targetTodo.content}" (sortOrder ${targetTodo.sortOrder}). You must complete the current step first: "${currentStep.content}" (sortOrder ${currentStep.sortOrder}). Execute steps in strict sequential order.`,
              };
            }
          } else if (
            params.status === 'completed' ||
            params.status === 'failed'
          ) {
            // Can only complete/fail a step that is currently in_progress
            if (targetTodo.status !== 'in_progress') {
              return {
                success: false,
                message: `REJECTED: Cannot mark "${targetTodo.content}" as ${params.status}. It is currently "${targetTodo.status}". Call transition_step(id, "in_progress") before completing or failing a step.`,
              };
            }
          }

          targetTodo.status = params.status;
          await todoRepo.save(targetTodo);

          await emitTodos();
          return {
            success: true,
            message: `Updated "${targetTodo.content}" -> ${params.status}`,
            todo: {
              id: targetTodo.id,
              content: targetTodo.content,
              status: targetTodo.status,
              sortOrder: targetTodo.sortOrder,
              updatedAt: targetTodo.updatedAt.toISOString(),
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to update step: ${message}`,
          };
        }
      },
    };

    const addTodoTool: any = {
      description:
        'Append a new step to the plan. Params: content (string). ONLY use when you genuinely discover a new requirement during execution that was not part of the original plan. Do NOT use to re-create steps you forgot to add earlier — finish the current step first.',
      inputSchema: z.object({
        content: z.string().min(1).describe('Todo content'),
      }),
      execute: async (params: { content: string }) => {
        // An approved plan is a contract: no unreviewed steps after the fact
        if (!planningAllowed()) {
          return { success: false, message: PLANNING_OFF_MESSAGE };
        }
        try {
          const existingTodos = await todoRepo.find({
            where: { conversationId },
          });
          const hasActiveTodos = existingTodos.some(
            (t) => t.status === 'pending' || t.status === 'in_progress',
          );

          // Guard: warn but allow append during active plan (the LLM might genuinely need it)
          if (hasActiveTodos) {
            this.logger.warn(
              `[append_step] Adding step while ${existingTodos.filter((t) => t.status === 'pending' || t.status === 'in_progress').length} step(s) still active`,
            );
          }

          const maxOrderResult = await todoRepo
            .createQueryBuilder('todo')
            .select('MAX(todo.sortOrder)', 'max')
            .where('todo.conversationId = :id', { id: conversationId })
            .getRawOne();
          const nextSortOrder = (maxOrderResult?.max ?? -1) + 1;

          const newEntity = todoRepo.create({
            conversationId,
            content: params.content,
            status: 'pending',
            sortOrder: nextSortOrder,
          });
          await todoRepo.save(newEntity);

          await emitTodos();
          return {
            success: true,
            message: `Added todo "${params.content}".`,
            todo: {
              id: newEntity.id,
              content: newEntity.content,
              status: newEntity.status,
              sortOrder: newEntity.sortOrder,
              updatedAt: newEntity.updatedAt.toISOString(),
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to add step: ${message}` };
        }
      },
    };

    const clearPlanTool: any = {
      description:
        'Clear entire plan (irreversible). Then call formulate_plan to create a new one.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          await todoRepo.delete({ conversationId });
          await emitTodos();
          return { success: true, message: 'Plan cleared.' };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to clear plan: ${message}`,
          };
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

  /**
   * Apply the approval mode the user picked for an approved plan: to the
   * running tools (they read `approval` at call time), the conversation
   * (later turns) and the client's mode selector.
   */
  private async switchApprovalMode(
    conversationId: string,
    approval: ApprovalSettings,
    mode: PlanRunMode,
    emitter?: EventEmitter,
  ): Promise<void> {
    // "allow all" belonged to the previous mode
    await this.approvals.resetConversation(conversationId);
    await this.conversationRepository.update(conversationId, {
      approvalMode: mode,
    });
    approval.mode = mode;
    emitter?.emit('approval-mode-changed', { mode });
  }

  getMemoryTools(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Record<string, ToolType> {
    const memoriesService = this.agentsMemories;

    const stmWriteTool: any = {
      description:
        'Save a key-value pair to short-term memory (conversation scope). ' +
        'Use this to remember important findings during execution (e.g., discovered IPs, scan results, target info).',
      inputSchema: z.object({
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
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to store memory: ${message}`,
          };
        }
      },
    };

    const stmReadTool: any = {
      description: 'Read a value from short-term memory by key.',
      inputSchema: z.object({
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
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to read memory: ${message}`,
          };
        }
      },
    };

    const stmListTool: any = {
      description: 'List all short-term memory entries for this conversation.',
      inputSchema: z.object({}),
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
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to list memories: ${message}`,
          };
        }
      },
    };

    const ltmWriteTool: any = {
      description:
        'Save important information to long-term memory (workspace scope, persists across conversations). ' +
        'Use this for persistent knowledge like target profiles, known vulnerabilities, organizational policies.',
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .describe('Content to store in long-term memory'),
      }),
      execute: async (params: { content: string }) => {
        try {
          await memoriesService.ltmSet(workspaceId, userId, params.content);
          return {
            success: true,
            message: 'Saved to long-term memory.',
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { success: false, message: `Failed to save LTM: ${message}` };
        }
      },
    };

    const ltmAppendTool: any = {
      description:
        'Append information to existing long-term memory (keeps previous content).',
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .describe('Content to append to existing long-term memory'),
      }),
      execute: async (params: { content: string }) => {
        try {
          const existing = await memoriesService.ltmGet(workspaceId, userId);
          const newContent = existing?.content
            ? `${existing.content}\n\n${params.content}`
            : params.content;
          await memoriesService.ltmSet(workspaceId, userId, newContent);
          return {
            success: true,
            message: 'Appended to long-term memory.',
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `Failed to append LTM: ${message}`,
          };
        }
      },
    };

    const ltmReadTool: any = {
      description: 'Read the current long-term memory content.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const record = await memoriesService.ltmGet(workspaceId, userId);
          return { content: record?.content || '(empty)' };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
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
    mcpOnly = false,
    approval?: ApprovalSettings,
  ): Record<string, ToolType> {
    const { AGENT, ASK } = AgentMode;
    const tools: Record<
      string,
      { method: ToolType; permissions: AgentMode[]; mcp: boolean }
    > = {
      enumerate_assets: {
        method: this.getAssetsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      discover_vulnerabilities: {
        method: this.getVulnerabilitiesTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      retrieve_targets: {
        method: this.getTargetsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      gather_statistics: {
        method: this.getStatisticsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      inspect_asset: {
        method: this.detailAssetTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      examine_target_assets: {
        method: this.listAssetsInTargetTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      investigate_vulnerability: {
        method: this.detailVulnTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      list_network_ports: {
        method: this.getPortsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      fingerprint_technologies: {
        method: this.getTechnologiesTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      verify_tls_settings: {
        method: this.getTlsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      retrieve_web_page: {
        method: this.webFetchTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      enumerate_open_issues: {
        method: this.listIssuesTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      inspect_issue: {
        method: this.detailIssueTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      display_available_tools: {
        method: this.listToolsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: false,
      },
      list_active_workers: {
        method: this.listWorkersTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      review_jobs: {
        method: this.listJobsTool(workspaceId),
        permissions: [AGENT, ASK],
        mcp: true,
      },
      execute_remote_command: {
        method: this.remoteExecuteTool(
          workspaceId,
          conversationId ?? '',
          emitter,
          approval,
        ),
        permissions: [AGENT],
        mcp: false,
      },
    };

    return Object.fromEntries(
      Object.entries(tools)
        .filter(([, config]) => config.permissions.includes(agentMode))
        .filter(([, config]) => (mcpOnly ? config.mcp : true))
        .map(([key, config]) => [
          key,
          approval && !SELF_GATED_TOOLS.has(key)
            ? this.withApproval(
                key,
                config.method,
                // Read at call time: approving a plan switches the mode mid-run
                () => ({
                  ...approval,
                  workspaceId,
                  conversationId: conversationId ?? '',
                }),
                emitter,
                READ_ONLY_TOOLS.has(key),
              )
            : config.method,
        ]),
    ) as Record<string, ToolType>;
  }

  /** Applies the same approval gate to dynamically discovered MCP tools. */
  wrapExternalToolsWithApproval(
    tools: Record<string, ToolType>,
    workspaceId: string,
    conversationId: string,
    approval: ApprovalSettings,
    emitter?: EventEmitter,
  ): Record<string, ToolType> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, toolDef]) => [
        name,
        this.withApproval(
          name,
          toolDef,
          () => ({
            ...approval,
            workspaceId,
            conversationId,
          }),
          emitter,
          isReadOnlyMcpTool(toolDef.metadata),
        ),
      ]),
    ) as Record<string, ToolType>;
  }

  /**
   * Wraps a tool so each call goes through the approval flow first, in any
   * agent mode. (SELF_GATED_TOOLS gate themselves on the raw command.)
   */
  private withApproval(
    name: string,
    toolDef: ToolType,
    ctx: () => ApprovalContext,
    emitter?: EventEmitter,
    readOnly = false,
  ): ToolType {
    const original = toolDef.execute as (
      params: unknown,
      options: { toolCallId: string; abortSignal?: AbortSignal },
    ) => Promise<unknown>;
    return {
      ...toolDef,
      execute: async (
        params: unknown,
        options: { toolCallId: string; abortSignal?: AbortSignal },
      ) => {
        const decision = await this.approvals.authorize(
          `${name} ${stableStringify(params)}`,
          options.toolCallId,
          ctx(),
          emitter,
          {
            tool: name,
            description:
              typeof toolDef.description === 'string'
                ? toolDef.description
                : undefined,
            toolMetadata:
              typeof toolDef.metadata === 'object' && toolDef.metadata !== null
                ? (toolDef.metadata as Record<string, unknown>)
                : undefined,
            input: params,
            readOnly,
          },
          options.abortSignal,
        );
        if (!decision.allowed) {
          return { error: deniedMessage('Tool call', decision) };
        }
        return original(params, options);
      },
    };
  }
}
