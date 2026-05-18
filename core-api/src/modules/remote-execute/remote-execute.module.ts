import { Module } from '@nestjs/common';
import { RemoteExecuteController } from './remote-execute.controller';
import { RemoteExecuteService } from './remote-execute.service';

@Module({
  controllers: [RemoteExecuteController],
  providers: [RemoteExecuteService],
})
export class RemoteExecuteModule {}
