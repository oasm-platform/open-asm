import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { WorkflowsModule } from '../workflows/workflows.module';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMembers, WorkspaceTarget]),
    ApiKeysModule,
    forwardRef(() => WorkflowsModule),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule { }
