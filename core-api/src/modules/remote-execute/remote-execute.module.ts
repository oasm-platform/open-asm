import { Module } from '@nestjs/common';
import { WorkersModule } from '@/modules/workers/workers.module';
import { RemoteExecuteService } from './remote-execute.service';

@Module({
  imports: [WorkersModule],
  providers: [RemoteExecuteService],
  exports: [RemoteExecuteService],
})
export class RemoteExecuteModule {}
