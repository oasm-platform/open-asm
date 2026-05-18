import { AssetsModule } from '@/modules/assets/assets.module';
import { StatisticModule } from '@/modules/statistic/statistic.module';
import { TargetsModule } from '@/modules/targets/targets.module';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { RemoteExecuteModule } from '@/modules/remote-execute/remote-execute.module';
import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsController } from './agents.controller';
import { AgentsMemoriesService } from './agents.memories';
import { AgentsService } from './agents.service';
import { AgentTool } from './agents.tools';
import { AgentsMcpService } from './agents.mcp';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMCPConfig } from './entities/agent-mcp-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentWorkspaceMemory } from './entities/agent-workspace-memory.entity';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentLLMConfig,
      AgentConversation,
      AgentMessage,
      AgentWorkspaceMemory,
      AgentMCPConfig,
    ]),
    AssetsModule,
    TargetsModule,
    forwardRef(() => VulnerabilitiesModule),
    StatisticModule,
    RemoteExecuteModule,
    HttpModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentsCompletionsService,
    AgentTool,
    AgentsMcpService,
    AgentsMemoriesService,
  ],
  exports: [
    AgentsService,
    AgentsCompletionsService,
    AgentsMemoriesService,
    AgentsMcpService,
  ],
})
export class AgentsModule {}
