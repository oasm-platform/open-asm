import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { GrpcClientModule } from '../../grpc-client/grpc-client.module';
import { AssistantGuard } from '@/common/guards/assistant.guard';

@Module({
  imports: [GrpcClientModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, AssistantGuard],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
