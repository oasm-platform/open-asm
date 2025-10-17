import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { GeoIpService } from './geo-ip/geo-ip.service';
import { RedisService } from './redis/redis.service';

const services = [RedisService, GeoIpService];

@Global()
@Module({
  imports: [HttpModule],
  providers: [...services],
  exports: [...services],
})
export class ServicesModule { }
