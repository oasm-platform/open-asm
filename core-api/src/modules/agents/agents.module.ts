import { AgentApprovalsController } from './agent-approvals.controller';
import { AgentCustomizationController } from './agent-customization.controller';
import { AgentMcpConfigsController } from './agent-mcp-configs.controller';
import { AgentModelsController } from './agent-models.controller';
import { AgentSettingsController } from './agent-settings.controller';
import { ContextCompactionService } from './context-compaction.service';
import { ConversationTitleService } from './conversation-title.service';
import { LlmConfigResolver } from './llm-config.resolver';
import { ActiveRunRegistry } from './active-run.registry';
import { ArtifactsModule } from '@/modules/artifacts/artifacts.module';
import { AssetsModule } from '@/modules/assets/assets.module';
import { ConnectorsModule } from '@/modules/connectors/connectors.module';
import { Project } from '@/modules/projects/entities/project.entity';
import { ProjectsModule } from '@/modules/projects/projects.module';
import { StatisticModule } from '@/modules/statistic/statistic.module';
import { TargetsModule } from '@/modules/targets/targets.module';
import { TemplatesModule } from '@/modules/templates/templates.module';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { RemoteExecuteModule } from '@/modules/remote-execute/remote-execute.module';
import { WorkersModule } from '@/modules/workers/workers.module';
import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsController } from './agents.controller';
import { AgentsApprovalsService } from './agents.approvals';
import { AgentsConfigService } from './agents.config';
import { AgentsDefinitionsService } from './agents.definitions';
import { AgentDefinition } from './entities/agent-definition.entity';
import { AgentConfig } from './entities/agent-config.entity';
import { AgentCommandApproval } from './entities/agent-command-approval.entity';
import { AgentsMemoriesService } from './agents.memories';
import { AgentsModelsCatalogService } from './agents.models-catalog';
import { AgentsStreamBufferService } from './agents.stream-buffer';
import { AgentsSubagentsService } from './agents.subagents';
import { AgentsWorkflowService, SubmitResultTools } from './agents.workflow';
import { AgentsUsageService } from './agents.usage';
import { AgentsService } from './agents.service';
import { AGENT_TOOL_CLASSES, AgentTool } from './agents.tools';
import { validateAgentFunctions } from './tools/agent-function';
import { AgentsMcpService } from './agents.mcp';
import { AgentsSkillsService } from './agents.skills';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentConversationTodo } from './entities/agent-conversation-todo.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMCPConfig } from './entities/agent-mcp-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentMessageToolCall } from './entities/tool-call.entity';
import { AgentWorkspaceMemory } from './entities/agent-workspace-memory.entity';
import { AgentSkill } from './entities/agent-skill.entity';
import { AgentSubagent } from './entities/agent-subagent.entity';
import { AgentToolRule } from './entities/agent-tool-rule.entity';
import { AgentsGuardService } from './agents.guard';
import { AgentWorkflowNote } from './entities/agent-workflow-note.entity';
import { HttpModule } from '@nestjs/axios';
import { VulnerabilityAnalyzerAdapter } from './vulnerability-analyzer.adapter';
import { IssuesModule } from '../issues/issues.module';
import { ToolsModule } from '../tools/tools.module';
import { JobsRegistryModule } from '../jobs-registry/jobs-registry.module';

/** Every class with @AgentFunction methods: their names must not collide. */
export const AGENT_FUNCTION_HOSTS = [
  ...AGENT_TOOL_CLASSES,
  AgentsSubagentsService,
  AgentsWorkflowService,
  SubmitResultTools,
  AgentsSkillsService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentLLMConfig,
      AgentConversation,
      AgentConversationTodo,
      AgentMessage,
      AgentMessageToolCall,
      AgentWorkspaceMemory,
      AgentMCPConfig,
      AgentSkill,
      AgentCommandApproval,
      AgentConfig,
      AgentSubagent,
      AgentWorkflowNote,
      AgentDefinition,
      AgentToolRule,
      Project,
    ]),
    AssetsModule,
    ArtifactsModule,
    TargetsModule,
    VulnerabilitiesModule,
    StatisticModule,
    RemoteExecuteModule,
    HttpModule,
    WorkersModule,
    ConnectorsModule,
    ProjectsModule,
    TemplatesModule,
    IssuesModule,
    ToolsModule,
    JobsRegistryModule,
  ],
  controllers: [
    AgentsController,
    AgentApprovalsController,
    AgentModelsController,
    AgentMcpConfigsController,
    AgentSettingsController,
    AgentCustomizationController,
  ],
  providers: [
    AgentsService,
    AgentsCompletionsService,
    ActiveRunRegistry,
    LlmConfigResolver,
    ConversationTitleService,
    ContextCompactionService,
    AgentTool,
    AgentsGuardService,
    AgentsMcpService,
    AgentsMemoriesService,
    AgentsSkillsService,
    AgentsApprovalsService,
    AgentsConfigService,
    AgentsModelsCatalogService,
    AgentsSubagentsService,
    AgentsWorkflowService,
    AgentsDefinitionsService,
    AgentsStreamBufferService,
    AgentsUsageService,
    VulnerabilityAnalyzerAdapter,
    ...AGENT_TOOL_CLASSES,
  ],
  exports: [
    AgentsService,
    AgentTool,
    AgentsCompletionsService,
    AgentsMemoriesService,
    AgentsMcpService,
    AgentsSkillsService,
    AgentsApprovalsService,
    AgentsModelsCatalogService,
    AgentsSubagentsService,
    AgentsWorkflowService,
    AgentsDefinitionsService,
  ],
})
export class AgentsModule implements OnModuleInit {
  /** Refuses to boot on a broken @AgentFunction (bad or reused name, MCP rules). */
  onModuleInit(): void {
    validateAgentFunctions(AGENT_FUNCTION_HOSTS);
  }
}
