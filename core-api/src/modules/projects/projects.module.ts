import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import {
  PROJECT_ASSET_DISCOVERY,
  PROJECT_TRIGGER_EVENTS,
} from '../event-bridge/sinks/projects/projects.sink';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Project } from './entities/project.entity';
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

@Global()
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
      Workspace,
    ]),
    ConnectorsModule,
    ArtifactsModule,
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
    // The event bridge's projects lane hands discovery batches and the
    // events of triggers here.
    { provide: PROJECT_ASSET_DISCOVERY, useExisting: ProjectsService },
    { provide: PROJECT_TRIGGER_EVENTS, useExisting: ProjectTriggersService },
  ],
  exports: [
    PROJECT_ASSET_DISCOVERY,
    PROJECT_TRIGGER_EVENTS,
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
