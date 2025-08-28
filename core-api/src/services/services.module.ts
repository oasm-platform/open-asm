import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

const services = [RedisService];

@Global()
@Module({
  providers: [...services],
  exports: [...services],
})
export class ServicesModule {}
