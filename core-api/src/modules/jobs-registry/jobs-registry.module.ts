import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';
import {
  AssetGroupsScheduleConsumer,
  AssetsDiscoveryScheduleConsumer,
} from './processors/scan-schedule.processor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Job, JobHistory])],
  controllers: [JobsRegistryController],
  providers: [
    JobsRegistryService,
    AssetsDiscoveryScheduleConsumer,
    AssetGroupsScheduleConsumer,
  ],
  exports: [JobsRegistryService],
})
export class JobsRegistryModule {}
