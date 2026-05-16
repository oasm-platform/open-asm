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
import { AgentsGraphService } from './agents.graph';
import { AgentsMcpService } from './agents.mcp';
import { AgentsSkillsService } from './agents.skills';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentEmbeddingConfig } from './entities/agent-embedding.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMCPConfig } from './entities/agent-mcp-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSkill } from './entities/agent-skill.entity';
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
      AgentSkill,
      AgentEmbeddingConfig,
    ]),
    AssetsModule,
    TargetsModule,
    forwardRef(() => VulnerabilitiesModule),
    StatisticModule,
    HttpModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentsCompletionsService,
    AgentTool,
    AgentsMcpService,
    AgentsMemoriesService,
    AgentsSkillsService,
    AgentsGraphService,
  ],
  exports: [
    AgentsService,
    AgentsCompletionsService,
    AgentsMemoriesService,
    AgentsMcpService,
    AgentsGraphService,
    AgentsSkillsService,
  ],
})
export class AgentsModule {}
