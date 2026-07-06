import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMembers]),
    ApiKeysModule,
    forwardRef(() => WorkflowsModule),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
