import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { GeoIpService } from './geo-ip/geo-ip.service';
import { RedisLockService } from './redis/distributed-lock.service';
import { RedisService } from './redis/redis.service';
import { WorkspaceEncryptionService } from './workspace-encryption/workspace-encryption.service';

const services = [
  RedisService,
  RedisLockService,
  GeoIpService,
  WorkspaceEncryptionService,
];

@Global()
@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Workspace])],
  providers: [...services],
  exports: [...services],
})
export class ServicesModule {}
