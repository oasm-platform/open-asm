import { Module } from '@nestjs/common';
import { WorkersModule } from '@/modules/workers/workers.module';
import { RemoteExecuteController } from './remote-execute.controller';
import { RemoteExecuteService } from './remote-execute.service';

@Module({
  imports: [WorkersModule],
  controllers: [RemoteExecuteController],
  providers: [RemoteExecuteService],
  exports: [RemoteExecuteService],
})
export class RemoteExecuteModule {}
