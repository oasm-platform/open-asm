import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowTemplateService } from './workflow-template.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, Workspace]),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowTemplateService],
  exports: [WorkflowsService, WorkflowTemplateService],
})
export class WorkflowsModule {}
