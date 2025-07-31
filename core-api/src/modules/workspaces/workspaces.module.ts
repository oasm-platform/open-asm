import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceStatisticsRepository } from './workspaces-statistics.repository';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMembers])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceStatisticsRepository],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
