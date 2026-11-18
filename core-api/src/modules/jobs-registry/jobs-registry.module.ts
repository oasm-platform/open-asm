import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors/connectors.module';
import { IntegrationConfigModule } from '../integrations/integration-config.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { JobErrorLog } from './entities/job-error-log.entity';
import { JobHistory } from './entities/job-history.entity';
import { Job } from './entities/job.entity';
import { JobsRegistryController } from './jobs-registry.controller';
import { JobDispatchService } from './job-dispatch.service';
import { JobHistoryQueryService } from './job-history-query.service';
import { JobsRegistryService } from './jobs-registry.service';
import { JobResultCleanupService } from './job-result-cleanup.service';
import { JobConfigSealService } from './job-config-seal.service';
import { JobRetentionService } from './job-retention.service';
import { JobResultProcessor } from './processors/job-result.processor';
import { WorkflowRunReconcilerService } from './workflow-run-reconciler.service';
import { WorkflowRunnerService } from './workflow-runner.service';
import { ToolsModule } from '../tools/tools.module';
import { StorageModule } from '../storage/storage.module';
import { WorkersModule } from '../workers/workers.module';
import { DataAdapterModule } from '../data-adapter/data-adapter.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobHistory,
      JobErrorLog,
    ]),
    ConnectorsModule,
    IntegrationConfigModule,
    WorkspacesModule,
    BullModule.registerQueue({
      name: BullMQName.JOB_RESULT,
    }),
    ToolsModule,
    StorageModule,
    WorkersModule,
    DataAdapterModule,
  ],
  controllers: [JobsRegistryController],
  providers: [
    JobsRegistryService,
    JobHistoryQueryService,
    JobDispatchService,
    WorkflowRunnerService,
    WorkflowRunReconcilerService,
    JobResultProcessor,
    JobResultCleanupService,
    JobRetentionService,
    JobConfigSealService,
  ],
  exports: [JobsRegistryService, WorkflowRunnerService],
})
export class JobsRegistryModule {}
