import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tool } from '../tools/entities/tools.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowTemplateService } from './workflow-template.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, Workspace, Tool]),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowTemplateService],
  exports: [WorkflowsService, WorkflowTemplateService],
})
export class WorkflowsModule {}
