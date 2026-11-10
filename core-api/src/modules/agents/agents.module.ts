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
import { Global, Module, forwardRef } from '@nestjs/common';
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
import { AgentsWorkflowService } from './agents.workflow';
import { AgentsUsageService } from './agents.usage';
import { AgentsService } from './agents.service';
import { AgentTool } from './agents.tools';
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

@Global()
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
    forwardRef(() => VulnerabilitiesModule),
    // Statistic → Vulnerabilities → Agents → Statistic is an import cycle.
    forwardRef(() => StatisticModule),
    RemoteExecuteModule,
    HttpModule,
    WorkersModule,
    ConnectorsModule,
    ProjectsModule,
    TemplatesModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentsCompletionsService,
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
export class AgentsModule {}
