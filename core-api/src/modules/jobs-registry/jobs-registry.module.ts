import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors/connectors.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ToolConfigProfile } from '../tools/entities/tool-config-profiles.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobsRegistryService } from './jobs-registry.service';
import { JobResultCleanupService } from './job-result-cleanup.service';
import { JobRetentionService } from './job-retention.service';
import { JobResultProcessor } from './processors/job-result.processor';
import { AssetsDiscoveryScheduleConsumer } from './processors/scan-schedule.processor';
import { WorkflowRunReconcilerService } from './workflow-run-reconciler.service';
import { WorkflowRunnerService } from './workflow-runner.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobHistory,
      JobErrorLog,
      ToolConfigProfile,
    ]),
    ConnectorsModule,
    IntegrationsModule,
    WorkspacesModule,
    BullModule.registerQueue({
      name: BullMQName.JOB_RESULT,
    }),
  ],
  controllers: [JobsRegistryController],
  providers: [
    JobsRegistryService,
    WorkflowRunnerService,
    WorkflowRunReconcilerService,
    AssetsDiscoveryScheduleConsumer,
    JobResultProcessor,
    JobResultCleanupService,
    JobRetentionService,
  ],
  exports: [JobsRegistryService, WorkflowRunnerService],
})
export class JobsRegistryModule {}
