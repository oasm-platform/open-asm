import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentLLMConfig } from './entities/agent-llm-config.entity';
import { AgentConversation } from './entities/agent-conversation.entity';
import { AgentMessage } from './entities/agent-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentLLMConfig, AgentConversation, AgentMessage]),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
