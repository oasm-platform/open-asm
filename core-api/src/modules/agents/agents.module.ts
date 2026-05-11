import { AssetsModule } from '@/modules/assets/assets.module';
import { StatisticModule } from '@/modules/statistic/statistic.module';
import { TargetsModule } from '@/modules/targets/targets.module';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsController } from './agents.controller';
import { AgentsMemoriesService } from './agents.memories';
import { AgentsService } from './agents.service';
import { AgentTool } from './agents.tools';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentWorkspaceMemory } from './entities/agent-workspace-memory.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentLLMConfig, AgentConversation, AgentMessage, AgentWorkspaceMemory]),
    AssetsModule,
    TargetsModule,
    forwardRef(() => VulnerabilitiesModule),
    StatisticModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsCompletionsService, AgentTool, AgentsMemoriesService],
  exports: [AgentsService, AgentsCompletionsService, AgentsMemoriesService],
})
export class AgentsModule {}
