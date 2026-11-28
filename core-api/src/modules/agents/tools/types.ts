import type { EventEmitter } from 'node:events';
import type { Repository } from 'typeorm';

import type { AgentMode } from '@/modules/agents/enums/agent.enums';
import type { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import type { AttackSurfaceQueryService } from '@/modules/attack-surface-query/attack-surface-query.service';
import type { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import type { IssuesService } from '@/modules/issues/issues.service';
import type { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import type { ProjectAssetsService } from '@/modules/projects/project-assets.service';
import type { ProjectFilesService } from '@/modules/projects/project-files.service';
import type { ProjectResultsService } from '@/modules/projects/project-results.service';
import type { ProjectScopeService } from '@/modules/projects/project-scope.service';
import type { ProjectTriggersService } from '@/modules/projects/project-triggers.service';
import type { ProjectWorkflowsService } from '@/modules/projects/project-workflows.service';
import type { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import type { ProjectsService } from '@/modules/projects/projects.service';
import type { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import type { StatisticService } from '@/modules/statistic/statistic.service';
import type { TargetsService } from '@/modules/targets/targets.service';
import type { TemplatesService } from '@/modules/templates/templates.service';
import type { ToolConfigProfilesService } from '@/modules/tools/tool-config-profiles.service';
import type { ToolsService } from '@/modules/tools/tools.service';
import type { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import type { VulnerabilityReviewService } from '@/modules/vulnerabilities/vulnerability-review.service';
import type { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
import type { WorkersService } from '@/modules/workers/workers.service';
import type { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import type { RedisService } from '@/services/redis/redis.service';

import type { AgentsApprovalsService, ApprovalSettings } from '../agents.approvals';
import type { AgentsGuardService } from '../agents.guard';
import type { AgentsMemoriesService } from '../agents.memories';
import type { SubagentOutput } from '../shared/conversation-metadata';
import type { AgentConversationTodo } from '../entities/agent-conversation-todo.entity';
import type { AgentConversation } from '../entities/agent-conversation.entity';

export interface ToolCallOptions {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

/** Plan tool settings of a run, see PlanTools. */
export interface PlanSettings {
  workspaceId: string;
  approval: ApprovalSettings;
  selfManaged?: boolean;
}

/** What a run knows when it builds its tool set. */
export interface AgentFunctionBuildContext {
  workspaceId: string;
  /** The member the run acts for; unset on the OASM MCP server (no user). */
  userId?: string;
  /** The agent mode; unset = the functions limited to some modes are left out. */
  mode?: AgentMode;
  /** The chat the tools run in; '' or unset when the run has none (vulAnalyze). */
  conversationId?: string;
  /** The conversation's project: locks every project-aware tool to it. */
  projectId?: string | null;
  /** Agent definition running the tools (a subagent's name); unset = main. */
  agentName?: string;
  /** The subagent run (agent_subagents.id) using the tools; unset = main. */
  subagentId?: string;
  /** Present => every gated tool goes through the guard and the approval flow. */
  approval?: ApprovalSettings;
  emitter?: EventEmitter;
  /** Plan tools: the run's settings; unset = plans are set without review. */
  plan?: PlanSettings;
  /** Subagent tools: lets the running iteration release a result it read. */
  onResultRead?: (id: string) => void;
  /** load_skill: the skills a subagent may load; unset = every enabled one. */
  skills?: readonly string[];
  /** submit_result: the subagent run's hand-back, one callback per run. */
  onSubmitResult?: (output: SubagentOutput) => void;
}

/** Second argument of every agent function: the run plus the model's call. */
export interface AgentFunctionContext extends AgentFunctionBuildContext {
  /** '' when the caller passed no call options. */
  toolCallId: string;
  abortSignal?: AbortSignal;
}

/**
 * What a project-aware tool reads of the run. A conversation about a project
 * locks every project-aware tool to it; elsewhere the model picks one with
 * `projectId`.
 */
export type ToolScope = Pick<
  AgentFunctionBuildContext,
  'projectId' | 'userId' | 'conversationId' | 'agentName'
>;

/**
 * The services the tool classes inject, by the property name every class
 * uses for it; the shared helpers take the slice they need (`Deps<...>`).
 */
export interface ToolServices {
  attackSurfaceQuery: AttackSurfaceQueryService;
  targetsService: TargetsService;
  vulnerabilitiesService: VulnerabilitiesService;
  vulnerabilityReviewService: VulnerabilityReviewService;
  statisticService: StatisticService;
  issuesService: IssuesService;
  toolsService: ToolsService;
  workersService: WorkersService;
  jobsRegistryService: JobsRegistryService;
  remoteExecuteService: RemoteExecuteService;
  conversationRepository: Repository<AgentConversation>;
  todoRepository: Repository<AgentConversationTodo>;
  agentsMemories: AgentsMemoriesService;
  approvals: AgentsApprovalsService;
  guard: AgentsGuardService;
  connectorRegistry: ConnectorRegistryService;
  toolConfigProfiles: ToolConfigProfilesService;
  remoteExecuteSubscribe: RemoteExecuteSubscribeService;
  redisService: RedisService;
  artifactsService: ArtifactsService;
  workspacesService: WorkspacesService;
  projectsService: ProjectsService;
  projectAssetsService: ProjectAssetsService;
  projectFilesService: ProjectFilesService;
  projectResultsService: ProjectResultsService;
  projectScopeService: ProjectScopeService;
  projectTriggersService: ProjectTriggersService;
  projectWorkflowsService: ProjectWorkflowsService;
  eventBridge: EventBridgeService;
  templatesService: TemplatesService;
}

export type Deps<K extends keyof ToolServices> = Pick<ToolServices, K>;
