import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { PROJECT_ASSET_DISCOVERY } from '../event-bridge/sinks/projects/projects.sink';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Project } from './entities/project.entity';
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
import { ProjectResultsService } from './project-results.service';
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
      ProjectAsset,
      ProjectScopeRule,
      ProjectVulnerability,
      ProjectWorkflow,
      ProjectWorkflowTrigger,
      Workflow,
      Workspace,
    ]),
    ConnectorsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectAssetsService,
    ProjectScopeService,
    ProjectWorkflowsService,
    ProjectTriggersService,
    ProjectResultsService,
    ProjectScheduleConsumer,
    ProjectTriggerEventsConsumer,
    // The event bridge's projects lane hands discovery batches here.
    { provide: PROJECT_ASSET_DISCOVERY, useExisting: ProjectsService },
  ],
  exports: [
    PROJECT_ASSET_DISCOVERY,
    ProjectsService,
    ProjectScopeService,
    ProjectTriggersService,
    ProjectWorkflowsService,
  ],
})
export class ProjectsModule {}
