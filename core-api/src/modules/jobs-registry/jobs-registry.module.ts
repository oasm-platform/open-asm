import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetGroupWorkflow } from '../asset-group/entities/asset-groups-workflows.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobOutbox } from './entities/job-outbox.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';
import {
  AssetGroupsScheduleConsumer,
  AssetsDiscoveryScheduleConsumer,
} from './processors/scan-schedule.processor';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobResultProcessor } from './processors/job-result.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobHistory,
      AssetGroupWorkflow,
      JobErrorLog,
      JobOutbox,
    ]),
    WorkspacesModule,
    BullModule.registerQueue({
      name: BullMQName.JOB_RESULT,
    }),
  ],
  controllers: [JobsRegistryController],
  providers: [
    JobsRegistryService,
    AssetsDiscoveryScheduleConsumer,
    AssetGroupsScheduleConsumer,
    JobResultProcessor,
  ],
  exports: [JobsRegistryService],
})
export class JobsRegistryModule {}