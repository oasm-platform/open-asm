import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspaceStatisticsRepository } from './workspaces-statistics.repository';
import { WorkspaceStatisticsView } from './entities/workspace-statistics.view.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMembers,
      WorkspaceStatisticsView,
    ]),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceStatisticsRepository],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
