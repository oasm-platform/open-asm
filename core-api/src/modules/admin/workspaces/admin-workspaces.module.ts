import { ArtifactsModule } from '@/modules/artifacts/artifacts.module';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminWorkspacesService } from './admin-workspaces.service';

/**
 * Admin read access to every workspace, served under /admin/workspaces.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Workspace]), ArtifactsModule],
  controllers: [AdminWorkspacesController],
  providers: [AdminWorkspacesService],
})
export class AdminWorkspacesModule {}
