import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Project } from './entities/project.entity';
import { ProjectsSink } from './event-lane/projects.sink';
import { ProjectArtifact } from './entities/project-artifact.entity';
import { ProjectAsset } from './entities/project-asset.entity';
import { ProjectScopeRule } from './entities/project-scope-rule.entity';
import { ProjectVulnerability } from './entities/project-vulnerability.entity';
import { ProjectWorkflow } from './entities/project-workflow.entity';
import { ProjectWorkflowTrigger } from './entities/project-workflow-trigger.entity';
import {
  ProjectScheduleConsumer,
  ProjectTriggerEventsConsumer,
} from './processors/project-schedule.processor';
import { ProjectAssetsService } from './project-assets.service';
import { ProjectFilesService } from './project-files.service';
import { ProjectResultsService } from './project-results.service';
import { ProjectRunEventsListener } from './project-run-events.listener';
import { ProjectScopeService } from './project-scope.service';
import { ProjectTriggersService } from './project-triggers.service';
import { ProjectWorkflowsService } from './project-workflows.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { StorageModule } from '../storage/storage.module';
import { ToolsModule } from '../tools/tools.module';
import { JobsRegistryModule } from '../jobs-registry/jobs-registry.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: BullMQName.PROJECT_WORKFLOW_SCHEDULE },
      { name: BullMQName.PROJECT_TRIGGER_EVENTS },
    ),
    TypeOrmModule.forFeature([
      Asset,
      Project,
      ProjectArtifact,
      ProjectAsset,
      ProjectScopeRule,
      ProjectVulnerability,
      ProjectWorkflow,
      ProjectWorkflowTrigger,
      Workflow,
    ]),
    ConnectorsModule,
    ArtifactsModule,
    StorageModule,
    ToolsModule,
    JobsRegistryModule,
    WorkflowsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectAssetsService,
    ProjectFilesService,
    ProjectScopeService,
    ProjectWorkflowsService,
    ProjectTriggersService,
    ProjectResultsService,
    ProjectScheduleConsumer,
    ProjectTriggerEventsConsumer,
    ProjectRunEventsListener,
    // The `projects` lane of the event bus (found by EventConsumersService)
    ProjectsSink,
  ],
  exports: [
    ProjectsService,
    ProjectAssetsService,
    ProjectFilesService,
    ProjectResultsService,
    ProjectScopeService,
    ProjectTriggersService,
    ProjectWorkflowsService,
  ],
})
export class ProjectsModule {}
