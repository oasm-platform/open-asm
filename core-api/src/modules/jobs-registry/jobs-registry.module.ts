import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetGroupWorkflow } from '../asset-group/entities/asset-groups-workflows.entity';
import { IssueComment } from '../issues/entities/issue-comment.entity';
import { Issue } from '../issues/entities/issue.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';
import { IssueCreationProcessor } from './processors/issue-creation.processor';
import { JobResultProcessor } from './processors/job-result.processor';
import {
  AssetGroupsScheduleConsumer,
  AssetsDiscoveryScheduleConsumer,
} from './processors/scan-schedule.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobHistory,
      AssetGroupWorkflow,
      JobErrorLog,
      Issue,
      IssueComment,
    ]),
    WorkspacesModule,
    BullModule.registerQueue({
      name: BullMQName.JOB_RESULT,
    }),
    BullModule.registerQueue({
      name: BullMQName.ISSUE_CREATION,
    }),
  ],
  controllers: [JobsRegistryController],
  providers: [
    JobsRegistryService,
    AssetsDiscoveryScheduleConsumer,
    AssetGroupsScheduleConsumer,
    JobResultProcessor,
    IssueCreationProcessor,
  ],
  exports: [JobsRegistryService],
})
export class JobsRegistryModule {}
