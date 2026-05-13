import { Module } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import { RemoteExecutionController } from './remote-execution.controller';
import { RemoteExecutionService } from './remote-execution.service';

@Module({
  imports: [],
  controllers: [RemoteExecutionController],
  providers: [RemoteExecutionService, RedisService],
  exports: [RemoteExecutionService],
})
export class CliModule {}
