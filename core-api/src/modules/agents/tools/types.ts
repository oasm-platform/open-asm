import type { Repository } from 'typeorm';

import type { WrapperType } from '@/common/types/app.types';
import type { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import type { AssetsService } from '@/modules/assets/assets.service';
import type { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import type { IssuesService } from '@/modules/issues/issues.service';
import type { JobsRegistryService } from '@/modules/jobs-registry/jobs-registry.service';
import type { RemoteExecuteService } from '@/modules/remote-execute/remote-execute.service';
import type { StatisticService } from '@/modules/statistic/statistic.service';
import type { TargetsService } from '@/modules/targets/targets.service';
import type { ToolConfigProfilesService } from '@/modules/tools/tool-config-profiles.service';
import type { ToolsService } from '@/modules/tools/tools.service';
import type { VulnerabilitiesService } from '@/modules/vulnerabilities/vulnerabilities.service';
import type { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
import type { WorkersService } from '@/modules/workers/workers.service';
import type { RedisService } from '@/services/redis/redis.service';

import type { AgentsApprovalsService } from '../agents.approvals';
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
  connectorRegistry: ConnectorRegistryService;
  toolConfigProfiles: ToolConfigProfilesService;
  remoteExecuteSubscribe: RemoteExecuteSubscribeService;
  redisService: RedisService;
  artifactsService: ArtifactsService;
}

export type Deps<K extends keyof AgentToolDeps> = Pick<AgentToolDeps, K>;
