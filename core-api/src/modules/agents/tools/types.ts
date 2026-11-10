import type { Repository } from 'typeorm';

import type { WrapperType } from '@/common/types/app.types';
import type { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import type { AssetsService } from '@/modules/assets/assets.service';
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

import type { AgentsApprovalsService } from '../agents.approvals';
import type { AgentsGuardService } from '../agents.guard';
import type { AgentsMemoriesService } from '../agents.memories';
import type { AgentConversationTodo } from '../entities/agent-conversation-todo.entity';
import type { AgentConversation } from '../entities/agent-conversation.entity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolType = any;

export interface ToolCallOptions {
  toolCallId: string;
  abortSignal?: AbortSignal;
}

/** Everything AgentTool injects; each tool file takes the slice it uses. */
export interface AgentToolDeps {
  assetsService: AssetsService;
  targetsService: TargetsService;
  vulnerabilitiesService: WrapperType<VulnerabilitiesService>;
  vulnerabilityReviewService: WrapperType<VulnerabilityReviewService>;
  statisticService: StatisticService;
  issuesService: WrapperType<IssuesService>;
  toolsService: WrapperType<ToolsService>;
  workersService: WrapperType<WorkersService>;
  jobsRegistryService: WrapperType<JobsRegistryService>;
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

export type Deps<K extends keyof AgentToolDeps> = Pick<AgentToolDeps, K>;

/**
 * What a tool set is built for. A conversation about a project locks every
 * project-aware tool to it; elsewhere the model picks one with `projectId`.
 */
export interface ToolScope {
  projectId?: string | null;
  /** Whose run it is: write tools check this member's workspace permissions. */
  userId?: string;
  /** The chat a new project gets linked to. */
  conversationId?: string;
  /** Agent definition running the tools (a subagent's name); unset = main. */
  agentName?: string;
}
