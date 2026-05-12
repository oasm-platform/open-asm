import { Module } from '@nestjs/common';
import { RedisService } from '@/services/redis/redis.service';
import { CliController } from './remote-execution.controller';
import { CliService } from './remote-execution.service';

@Module({
  imports: [],
  controllers: [CliController],
  providers: [CliService, RedisService],
  exports: [CliService],
})
export class CliModule {}
