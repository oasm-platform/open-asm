import { ArtifactsModule } from '@/modules/artifacts/artifacts.module';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigsModule } from '../system-configs/system-configs.module';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminWorkspacesService } from './admin-workspaces.service';

/**
 * Admin read access to every workspace, served under /admin/workspaces.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace]),
    ArtifactsModule,
    // AdminGuard (`@Admin()`) injects SystemConfigsService
    SystemConfigsModule,
  ],
  controllers: [AdminWorkspacesController],
  providers: [AdminWorkspacesService],
})
export class AdminWorkspacesModule {}
