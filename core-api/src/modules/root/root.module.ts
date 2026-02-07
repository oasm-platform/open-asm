import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { UsersModule } from '../users/users.module';
import { RootController } from './root.controller';
import { RootService } from './root.service';

@Module({
  imports: [UsersModule, AiAssistantModule, SystemConfigsModule],
  controllers: [RootController],
  providers: [RootService],
})
export class RootModule {}
