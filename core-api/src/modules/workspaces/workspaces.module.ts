import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { WorkspaceMemberPermission } from './entities/workspace-member-permission.entity';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspacesController } from './workspaces.controller';
import { WorkspaceMembershipService } from './workspace-membership.service';
import { WorkspacesService } from './workspaces.service';
import { NotificationsModule } from '../notifications/notifications.module';
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMembers,
      WorkspacePermission,
      WorkspaceMemberPermission,
      WorkspaceInvitation,
    ]),
    ApiKeysModule,
    ArtifactsModule,
    NotificationsModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMembershipService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
