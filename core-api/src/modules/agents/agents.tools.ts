import { firstMissingPermission } from '@/common/utils/permission-keys.util';
import { Injectable, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Tool } from 'ai';
import type { EventEmitter } from 'node:events';

import { AgentMode } from '@/modules/agents/enums/agent.enums';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';

import {
  AgentsApprovalsService,
  type ApprovalContext,
  type ApprovalSettings,
} from './agents.approvals';
import { AgentsGuardService, guardApprovalMeta } from './agents.guard';
import {
  agentFunctionsOf,
  buildAgentFunction,
  isOffered,
  type AgentFunctionEntry,
} from './tools/agent-function';
import { ArtifactTools } from './tools/artifact.tools';
import { AttackSurfaceQueryTools } from './tools/attack-surface-query.tools';
import { ConnectorTools } from './tools/connector.tools';
import { deniedMessage, stableStringify } from './tools/helpers';
import { MemoryTools } from './tools/memory.tools';
import { PlanTools } from './tools/plan.tools';
import { ProjectBuildTools } from './tools/project-build.tools';
import { ProjectTools } from './tools/project.tools';
import { RemoteExecuteTools } from './tools/remote-execute.tool';
import type {
  AgentFunctionBuildContext,
  PlanSettings,
  ToolCallOptions,
} from './tools/types';
import { VulnerabilityProposalTools } from './tools/vulnerability-proposal.tool';
import { WebFetchTools } from './tools/web-fetch.tool';
import { WorkspaceTools } from './tools/workspace.tools';
import { isNotFound } from '@/common/errors/error-checks';

/**
 * The built-in tool classes, in the order the model sees their functions
 * (inside a class: the order the methods are written in).
 */
export const BUILTIN_TOOL_CLASSES: readonly Type[] = [
  WorkspaceTools,
  AttackSurfaceQueryTools,
  WebFetchTools,
  ConnectorTools,
  ProjectTools,
  ProjectBuildTools,
  VulnerabilityProposalTools,
  RemoteExecuteTools,
];

/** The tool classes of AgentTool: the built-ins and the per-run families. */
export const AGENT_TOOL_CLASSES: readonly Type[] = [
  ...BUILTIN_TOOL_CLASSES,
  PlanTools,
  MemoryTools,
  ArtifactTools,
];

const BUILTIN_FUNCTIONS = BUILTIN_TOOL_CLASSES.flatMap(agentFunctionsOf).map(
  ({ options }) => options,
);

/**
 * Built-in tools that only read OASM data (`readOnly: true`), so MANUAL runs
 * them without asking. Not retrieve_web_page: a URL it fetches can carry data
 * out.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(
  BUILTIN_FUNCTIONS.filter((o) => o.readOnly).map((o) => o.name),
);

/**
 * The only tools on the OASM MCP server (`mcp: true`): workspace data
 * lookups. MCP calls skip the approval flow, so the boot check refuses any
 * that is not read-only.
 */
export const MCP_TOOLS: ReadonlySet<string> = new Set(
  BUILTIN_FUNCTIONS.filter((o) => o.mcp && o.readOnly).map((o) => o.name),
);

/**
 * The workspace permission keys each built-in tool needs: the key of the
 * HTTP route that reads or changes the same data, so the chat can never
 * reach what the API refuses the same member.
 */
export const TOOL_PERMISSIONS: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    BUILTIN_FUNCTIONS.flatMap((o) =>
      o.permissions === 'ungated' ? [] : [[o.name, o.permissions]],
    ),
  );

/** What the approval gate reads off a tool. */
interface GateableTool {
  description?: unknown;
  metadata?: unknown;
  execute: (params: unknown, options: ToolCallOptions) => Promise<unknown>;
}

/**
 * The parts of a tool the gates read. Through `unknown`: comparing the AI
 * SDK's Tool type with another type is too deep for the type checker.
 */
const gateable = (toolDef: Tool) => toolDef as unknown as GateableTool;

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
 * Builds a run's tool set from the @AgentFunction methods of the tool
 * classes (./tools) and puts each tool behind its gates: the member's
 * workspace permission, then the guard and the approval flow.
 */
@Injectable()
export class AgentTool {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly workspacesService: WorkspacesService,
    private readonly approvals: AgentsApprovalsService,
    private readonly guard: AgentsGuardService,
  ) {}

  /** Plan tools (formulate_plan, transition_step, append_step, scrap_plan). */
  getTodoTools(
    conversationId: string,
    emitter?: EventEmitter,
    plan?: PlanSettings,
  ): Record<string, Tool> {
    return this.build([PlanTools], {
      workspaceId: plan?.workspaceId ?? '',
      conversationId,
      emitter,
      plan,
    });
  }

  getMemoryTools(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Record<string, Tool> {
    return this.build([MemoryTools], { workspaceId, userId, conversationId });
  }

  /** save_file (the user's private Files) and save_template (workspace templates). */
  getArtifactTools(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Record<string, Tool> {
    return this.build([ArtifactTools], {
      workspaceId,
      userId,
      conversationId,
    });
  }

  /**
   * The OASM MCP server's tools: the `mcp: true` ones, never one that is not
   * read-only. Ungated: MCP has no approval flow and no user.
   */
  getMcpTools(workspaceId: string): Record<string, Tool> {
    const ctx: AgentFunctionBuildContext = { workspaceId };
    const tools: Record<string, Tool> = {};
    for (const cls of BUILTIN_TOOL_CLASSES) {
      const instance = this.moduleRef.get<object>(cls);
      for (const entry of agentFunctionsOf(cls)) {
        if (!entry.options.mcp || !entry.options.readOnly) continue;
        tools[entry.options.name] = buildAgentFunction(instance, entry, ctx);
      }
    }
    return tools;
  }

  /**
   * The built-in tools for `agentMode`, run on behalf of `userId`: every call
   * first needs that member's workspace permission (the function's
   * `permissions`), then goes through the approval flow when given. With
   * `projectId` (the conversation's project) the project-aware tools are
   * locked to it. `agentName` names the agent definition running them (a
   * subagent); tools that record provenance (propose_vulnerability) use it.
   */
  getTools(
    workspaceId: string,
    userId: string,
    agentMode: AgentMode,
    emitter?: EventEmitter,
    conversationId?: string,
    approval?: ApprovalSettings,
    projectId?: string | null,
    agentName?: string,
  ): Record<string, Tool> {
    return this.build(BUILTIN_TOOL_CLASSES, {
      workspaceId,
      userId,
      mode: agentMode,
      emitter,
      conversationId,
      approval,
      projectId,
      agentName,
    });
  }

  /** The functions of `classes` the run offers, each behind its gates. */
  private build(
    classes: readonly Type[],
    ctx: AgentFunctionBuildContext,
  ): Record<string, Tool> {
    const tools: Record<string, Tool> = {};
    for (const cls of classes) {
      const instance = this.moduleRef.get<object>(cls);
      for (const entry of agentFunctionsOf(cls)) {
        if (!isOffered(entry.options, ctx, instance)) continue;
        tools[entry.options.name] = this.gate(
          buildAgentFunction(instance, entry, ctx),
          entry,
          ctx,
        );
      }
    }
    return tools;
  }

  /**
   * The permission check first, so nobody is asked to approve what the
   * member may not do; then the guard and the approval flow.
   */
  private gate(
    toolDef: Tool,
    { options }: AgentFunctionEntry,
    ctx: AgentFunctionBuildContext,
  ): Tool {
    const { approval } = ctx;
    let gated = toolDef;
    // Wrapped inside out: the approval wrapper goes on first so the
    // permission wrapper, added last, runs first. Keep this order.
    if (approval && (options.gate ?? 'approval') === 'approval') {
      gated = this.withApproval(
        options.name,
        gated,
        // Read at call time: approving a plan switches the mode mid-run
        () => ({
          ...approval,
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId ?? '',
        }),
        ctx.emitter,
        options.readOnly === true,
      );
    }
    if (options.permissions !== 'ungated') {
      gated = this.withPermission(
        options.permissions,
        gated,
        ctx.workspaceId,
        ctx.userId ?? '',
      );
    }
    return gated;
  }

  /** Applies the same approval gate to dynamically discovered MCP tools. */
  wrapExternalToolsWithApproval(
    tools: Record<string, Tool>,
    workspaceId: string,
    conversationId: string,
    approval: ApprovalSettings,
    emitter?: EventEmitter,
  ): Record<string, Tool> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, toolDef]) => [
        name,
        this.withApproval(
          name,
          toolDef,
          () => ({ ...approval, workspaceId, conversationId }),
          emitter,
          isReadOnlyMcpTool(gateable(toolDef).metadata),
          true,
        ),
      ]),
    );
  }

  /**
   * Applies the approval gate to tools built outside this class (e.g. the
   * subagent tools), so Agent mode still blocks them until a plan is approved.
   */
  gateTools(
    tools: Record<string, Tool>,
    workspaceId: string,
    conversationId: string,
    approval: ApprovalSettings,
    emitter: EventEmitter | undefined,
    readOnly: boolean,
  ): Record<string, Tool> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, toolDef]) => [
        name,
        this.withApproval(
          name,
          toolDef,
          () => ({ ...approval, workspaceId, conversationId }),
          emitter,
          readOnly,
        ),
      ]),
    );
  }

  /**
   * Wraps a tool so a call runs only when `userId` holds the `required`
   * keys, read at call time (a revoked key stops the next call), with the
   * API guard's rule.
   */
  private withPermission(
    required: readonly string[],
    toolDef: Tool,
    workspaceId: string,
    userId: string,
  ): Tool {
    const { execute: original } = gateable(toolDef);
    return {
      ...gateable(toolDef),
      execute: async (params: unknown, options: ToolCallOptions) => {
        const refused = await this.permissionRefusal(
          required,
          workspaceId,
          userId,
        );
        if (refused) return { error: refused };
        return original(params, options);
      },
    } satisfies GateableTool as unknown as Tool;
  }

  /** Why `userId` may not run a tool needing `required` here, or null when they may. */
  private async permissionRefusal(
    required: readonly string[],
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    let permissionKeys: string[];
    try {
      ({ permissionKeys } =
        await this.workspacesService.getMembershipWithPermissions(
          workspaceId,
          userId,
        ));
    } catch (error) {
      if (isNotFound(error)) {
        return 'Not executed: the user is not a member of this workspace.';
      }
      throw error;
    }
    const missingKey = firstMissingPermission(permissionKeys, required);
    return missingKey
      ? `Not executed: the user lacks the "${missingKey}" workspace permission for this.`
      : null;
  }

  /**
   * Wraps a tool so each call goes through the guard (workspace rules, scope;
   * the built-in deny list for `external` MCP tools) and then the approval
   * flow, in any agent mode. (Self-gated functions gate themselves.)
   */
  private withApproval(
    name: string,
    toolDef: Tool,
    ctx: () => ApprovalContext,
    emitter?: EventEmitter,
    readOnly = false,
    external = false,
  ): Tool {
    const {
      execute: original,
      description,
      metadata,
    } = gateable(toolDef);
    return {
      ...gateable(toolDef),
      execute: async (params: unknown, options: ToolCallOptions) => {
        const context = ctx();
        const verdict = await this.guard.evaluate({
          tool: name,
          input: params,
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
          builtin: external,
        });
        if (verdict.action === 'deny') {
          return { error: verdict.message, policy: verdict.policy };
        }
        const decision = await this.approvals.authorize(
          `${name} ${stableStringify(params)}`,
          options.toolCallId,
          context,
          emitter,
          {
            tool: name,
            ...guardApprovalMeta(verdict, description),
            toolMetadata:
              typeof metadata === 'object' && metadata !== null
                ? (metadata as Record<string, unknown>)
                : undefined,
            input: params,
            readOnly,
          },
          options.abortSignal,
        );
        if (!decision.allowed) {
          return {
            error: deniedMessage('Tool call', decision),
            ...('policy' in verdict ? { policy: verdict.policy } : {}),
          };
        }
        return original(params, options);
      },
    } satisfies GateableTool as unknown as Tool;
  }
}
