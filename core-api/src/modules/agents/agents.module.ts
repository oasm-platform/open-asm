import { AssetsModule } from '@/modules/assets/assets.module';
import { StatisticModule } from '@/modules/statistic/statistic.module';
import { TargetsModule } from '@/modules/targets/targets.module';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { RemoteExecuteModule } from '@/modules/remote-execute/remote-execute.module';
import { WorkersModule } from '@/modules/workers/workers.module';
import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsController } from './agents.controller';
import { AgentsMemoriesService } from './agents.memories';
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
    ]),
    AssetsModule,
    TargetsModule,
    forwardRef(() => VulnerabilitiesModule),
    StatisticModule,
    RemoteExecuteModule,
    HttpModule,
    WorkersModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentsCompletionsService,
    AgentTool,
    AgentsMcpService,
    AgentsMemoriesService,
    AgentsSkillsService,
  ],
  exports: [
    AgentsService,
    AgentsCompletionsService,
    AgentsMemoriesService,
    AgentsMcpService,
    AgentsSkillsService,
  ],
})
export class AgentsModule {}
