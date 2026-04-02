import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentTool } from './agents.tools';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { TargetsModule } from '@/modules/targets/targets.module';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { StatisticModule } from '@/modules/statistic/statistic.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentLLMConfig, AgentConversation, AgentMessage]),
    TargetsModule,
    VulnerabilitiesModule,
    StatisticModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentTool],
  exports: [AgentsService],
})
export class AgentsModule {}
