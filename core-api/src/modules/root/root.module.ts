import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RootController } from './root.controller';
import { RootService } from './root.service';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

@Module({
  imports: [UsersModule, AiAssistantModule],
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
