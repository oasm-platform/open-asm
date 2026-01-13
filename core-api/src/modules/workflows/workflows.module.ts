import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { Workflow } from './entities/workflow.entity';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, Workspace]),
    forwardRef(() => WorkspacesModule),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
