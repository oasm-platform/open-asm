import type { WrapperType } from '@/common/types/app.types';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Tool } from 'ai';
import type { EventEmitter } from 'node:events';
import { Repository } from 'typeorm';

import { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import { AssetsService } from '@/modules/assets/assets.service';
import { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { IssuesService } from '@/modules/issues/issues.service';
import { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import { ProjectAssetsService } from '@/modules/projects/project-assets.service';
import { ProjectFilesService } from '@/modules/projects/project-files.service';
import { ProjectResultsService } from '@/modules/projects/project-results.service';
import { ProjectScopeService } from '@/modules/projects/project-scope.service';
import { ProjectTriggersService } from '@/modules/projects/project-triggers.service';
import { ProjectWorkflowsService } from '@/modules/projects/project-workflows.service';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { ProjectsService } from '@/modules/projects/projects.service';
import { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { TargetsService } from '@/modules/targets/targets.service';
import { ToolConfigProfilesService } from '@/modules/tools/tool-config-profiles.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import { VulnerabilityReviewService } from '@/modules/vulnerabilities/vulnerability-review.service';
import { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
import { WorkersService } from '@/modules/workers/workers.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { RedisService } from '@/services/redis/redis.service';

import { AgentMode } from '@/common/enums/enum';
import {
  AgentsApprovalsService,
  type ApprovalContext,
  type ApprovalSettings,
} from './agents.approvals';
import { AgentsMemoriesService } from './agents.memories';
import { AgentConversationTodo } from './entities/agent-conversation-todo.entity';
import { AgentConversation } from './entities/agent-conversation.entity';
import { artifactTools } from './tools/artifact.tools';
import { readToolOutputTool, runConnectorTool } from './tools/connector.tools';
import { deniedMessage, stableStringify } from './tools/helpers';
import { memoryTools } from './tools/memory.tools';
import { planTools } from './tools/plan.tools';
import {
  addProjectTriggerTool,
  addProjectWorkflowTool,
  addTargetsTool,
  createProjectTool,
  installToolTool,
  listPipelineToolsTool,
  listWorkflowTemplatesTool,
  removeProjectTriggerTool,
  removeProjectWorkflowTool,
  updateProjectInstructionTool,
  updateProjectScopeTool,
} from './tools/project-build.tools';
import {
  addAssetsToProjectTool,
  inspectProjectTool,
  listProjectAssetsTool,
  listProjectRunsTool,
  listProjectsTool,
  readProjectFileTool,
  removeAssetsFromProjectTool,
  runProjectWorkflowTool,
} from './tools/project.tools';
import { remoteExecuteTool } from './tools/remote-execute.tool';
import type {
  AgentToolDeps,
  ToolCallOptions,
  ToolScope,
  ToolType,
} from './tools/types';
import { proposeVulnerabilityTool } from './tools/vulnerability-proposal.tool';
import { webFetchTool } from './tools/web-fetch.tool';
import {
  detailAssetTool,
  detailIssueTool,
  detailVulnTool,
  getAssetsTool,
  getPortsTool,
  getStatisticsTool,
  getTargetsTool,
  getTechnologiesTool,
  getTlsTool,
  getVulnerabilitiesTool,
  listAssetsInTargetTool,
  listConnectorsTool,
  listIssuesTool,
  listJobsTool,
  listWorkersTool,
} from './tools/workspace.tools';

type ToolBuilder = (
  deps: AgentToolDeps,
  workspaceId: string,
  scope: ToolScope,
) => Tool;

/** Tools offered in both agent modes, in the order the model sees them. */
const WORKSPACE_TOOLS: Record<string, ToolBuilder> = {
  enumerate_assets: getAssetsTool,
  discover_vulnerabilities: getVulnerabilitiesTool,
  retrieve_targets: getTargetsTool,
  gather_statistics: getStatisticsTool,
  inspect_asset: detailAssetTool,
  examine_target_assets: listAssetsInTargetTool,
  investigate_vulnerability: detailVulnTool,
  list_network_ports: getPortsTool,
  fingerprint_technologies: getTechnologiesTool,
  verify_tls_settings: getTlsTool,
  retrieve_web_page: webFetchTool,
  enumerate_open_issues: listIssuesTool,
  inspect_issue: detailIssueTool,
  display_available_tools: listConnectorsTool,
  list_active_workers: listWorkersTool,
  review_jobs: listJobsTool,
  list_projects: listProjectsTool,
  inspect_project: inspectProjectTool,
  list_project_assets: listProjectAssetsTool,
  list_project_runs: listProjectRunsTool,
  read_project_file: readProjectFileTool,
  list_workflow_templates: listWorkflowTemplatesTool,
  list_pipeline_tools: listPipelineToolsTool,
};

/** Agent mode only: they build or change projects, or start their scans. */
const PROJECT_ACTION_TOOLS: Record<string, ToolBuilder> = {
  create_project: createProjectTool,
  add_targets: addTargetsTool,
  update_project_scope: updateProjectScopeTool,
  add_project_workflow: addProjectWorkflowTool,
  remove_project_workflow: removeProjectWorkflowTool,
  add_project_trigger: addProjectTriggerTool,
  remove_project_trigger: removeProjectTriggerTool,
  install_tool: installToolTool,
  update_project_instruction: updateProjectInstructionTool,
  add_assets_to_project: addAssetsToProjectTool,
  remove_assets_from_project: removeAssetsFromProjectTool,
  run_project_workflow: runProjectWorkflowTool,
  // Records a proven finding for human review; nothing counts until approved
  propose_vulnerability: proposeVulnerabilityTool,
};

/**
 * The only tools on the OASM MCP server: workspace data lookups. MCP calls
 * skip the approval flow, so nothing that runs commands or connectors,
 * fetches URLs or writes may ever be listed here (getMcpTools also drops
 * anything that is not in READ_ONLY_TOOLS).
 */
export const MCP_TOOLS: ReadonlySet<string> = new Set([
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
  'list_active_workers',
  'review_jobs',
  'list_projects',
  'inspect_project',
  'list_project_assets',
  'list_project_runs',
  'read_project_file',
  'list_workflow_templates',
  'list_pipeline_tools',
]);

/** Tools that gate themselves (on the raw command) instead of via withApproval. */
const SELF_GATED_TOOLS = new Set(['execute_remote_command']);

/**
 * Built-in tools that only read OASM data, so MANUAL runs them without
 * asking. Not retrieve_web_page: a URL it fetches can carry data out.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
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
  'list_projects',
  'inspect_project',
  'list_project_assets',
  'list_project_runs',
  'read_project_file',
  'list_workflow_templates',
  'list_pipeline_tools',
  'read_tool_output',
]);

/** What the approval gate reads off a tool. */
interface GateableTool {
  description?: unknown;
  metadata?: unknown;
  execute: (params: unknown, options: ToolCallOptions) => Promise<unknown>;
}

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
 * Builds the agent's tool set (the tools themselves live in ./tools) and
 * puts each tool behind the approval flow.
 */
@Injectable()
export class AgentTool {
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
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly toolConfigProfiles: ToolConfigProfilesService,
    private readonly remoteExecuteSubscribe: RemoteExecuteSubscribeService,
    private readonly redisService: RedisService,
    private readonly artifactsService: ArtifactsService,
    private readonly workspacesService: WorkspacesService,
    private readonly projectsService: ProjectsService,
    private readonly projectAssetsService: ProjectAssetsService,
    private readonly projectFilesService: ProjectFilesService,
    private readonly projectResultsService: ProjectResultsService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly projectTriggersService: ProjectTriggersService,
    private readonly projectWorkflowsService: ProjectWorkflowsService,
    private readonly eventBridge: EventBridgeService,
    @Inject(forwardRef(() => VulnerabilityReviewService))
    private readonly vulnerabilityReviewService: WrapperType<VulnerabilityReviewService>,
  ) {}

  private get deps(): AgentToolDeps {
    return {
      assetsService: this.assetsService,
      targetsService: this.targetsService,
      vulnerabilitiesService: this.vulnerabilitiesService,
      vulnerabilityReviewService: this.vulnerabilityReviewService,
      statisticService: this.statisticService,
      issuesService: this.issuesService,
      toolsService: this.toolsService,
      workersService: this.workersService,
      jobsRegistryService: this.jobsRegistryService,
      remoteExecuteService: this.remoteExecuteService,
      conversationRepository: this.conversationRepository,
      todoRepository: this.todoRepository,
      agentsMemories: this.agentsMemories,
      approvals: this.approvals,
      connectorRegistry: this.connectorRegistry,
      toolConfigProfiles: this.toolConfigProfiles,
      remoteExecuteSubscribe: this.remoteExecuteSubscribe,
      redisService: this.redisService,
      artifactsService: this.artifactsService,
      workspacesService: this.workspacesService,
      projectsService: this.projectsService,
      projectAssetsService: this.projectAssetsService,
      projectFilesService: this.projectFilesService,
      projectResultsService: this.projectResultsService,
      projectScopeService: this.projectScopeService,
      projectTriggersService: this.projectTriggersService,
      projectWorkflowsService: this.projectWorkflowsService,
      eventBridge: this.eventBridge,
    };
  }

  /** Plan tools (formulate_plan, transition_step, append_step, scrap_plan). */
  getTodoTools(
    conversationId: string,
    emitter?: EventEmitter,
    plan?: Parameters<typeof planTools>[3],
  ): Record<string, ToolType> {
    return planTools(this.deps, conversationId, emitter, plan);
  }

  getMemoryTools(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Record<string, ToolType> {
    return memoryTools(this.deps, workspaceId, userId, conversationId);
  }

  /** save_file: writes into the user's own private workspace files. */
  getArtifactTools(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ): Record<string, ToolType> {
    return artifactTools(this.deps, workspaceId, userId, conversationId);
  }

  /**
   * The OASM MCP server's tools: MCP_TOOLS only, and never one that is not
   * read-only, whatever MCP_TOOLS says. Ungated: MCP has no approval flow.
   */
  getMcpTools(workspaceId: string): Record<string, ToolType> {
    const deps = this.deps;
    return Object.fromEntries(
      Object.entries(WORKSPACE_TOOLS)
        .filter(([name]) => MCP_TOOLS.has(name) && READ_ONLY_TOOLS.has(name))
        .map(([name, build]) => [name, build(deps, workspaceId, {})]),
    );
  }

  /**
   * The built-in tools for `agentMode`, behind the approval flow when given.
   * With `projectId` (the conversation's project) the project-aware tools are
   * locked to it. `agentName` names the agent definition running them (a
   * subagent); tools that record provenance (propose_vulnerability) use it.
   */
  getTools(
    workspaceId: string,
    agentMode: AgentMode,
    emitter?: EventEmitter,
    conversationId?: string,
    approval?: ApprovalSettings,
    projectId?: string | null,
    agentName?: string,
  ): Record<string, ToolType> {
    const deps = this.deps;
    const conversation = conversationId ?? '';
    const scope: ToolScope = {
      projectId,
      userId: approval?.userId,
      conversationId,
      agentName,
    };
    const tools: Record<string, ToolType> = {};

    for (const [name, build] of Object.entries(WORKSPACE_TOOLS)) {
      tools[name] = build(deps, workspaceId, scope);
    }
    // AGENT-only tools act on workers and projects
    if (agentMode === AgentMode.AGENT) {
      for (const [name, build] of Object.entries(PROJECT_ACTION_TOOLS)) {
        tools[name] = build(deps, workspaceId, scope);
      }
      tools.execute_remote_command = remoteExecuteTool(
        deps,
        workspaceId,
        conversation,
        emitter,
        approval,
      );
      // Pages the long outputs of execute_remote_command and run_tool_connector
      tools.read_tool_output = readToolOutputTool(deps, conversation);
      const runTool = runConnectorTool(deps, workspaceId, conversation);
      if (runTool) {
        tools.run_tool_connector = runTool;
      }
    }

    if (!approval) return tools;
    return Object.fromEntries(
      Object.entries(tools).map(([name, toolDef]) => [
        name,
        SELF_GATED_TOOLS.has(name)
          ? toolDef
          : this.withApproval(
              name,
              toolDef,
              // Read at call time: approving a plan switches the mode mid-run
              () => ({
                ...approval,
                workspaceId,
                conversationId: conversation,
              }),
              emitter,
              READ_ONLY_TOOLS.has(name),
            ),
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
          () => ({ ...approval, workspaceId, conversationId }),
          emitter,
          isReadOnlyMcpTool((toolDef as GateableTool).metadata),
        ),
      ]),
    ) as Record<string, ToolType>;
  }

  /**
   * Applies the approval gate to tools built outside this class (e.g. the
   * subagent tools), so Agent mode still blocks them until a plan is approved.
   */
  gateTools(
    tools: Record<string, ToolType>,
    workspaceId: string,
    conversationId: string,
    approval: ApprovalSettings,
    emitter: EventEmitter | undefined,
    readOnly: boolean,
  ): Record<string, ToolType> {
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
    const {
      execute: original,
      description,
      metadata,
    } = toolDef as GateableTool;
    return {
      ...(toolDef as GateableTool),
      execute: async (params: unknown, options: ToolCallOptions) => {
        const decision = await this.approvals.authorize(
          `${name} ${stableStringify(params)}`,
          options.toolCallId,
          ctx(),
          emitter,
          {
            tool: name,
            description:
              typeof description === 'string' ? description : undefined,
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
          return { error: deniedMessage('Tool call', decision) };
        }
        return original(params, options);
      },
    };
  }
}
