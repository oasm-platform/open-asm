import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactQuotaService } from './artifact-quota.service';
import { ArtifactFoldersController } from './artifact-folders.controller';
import { ArtifactFoldersService } from './artifact-folders.service';
import { ArtifactSweepService } from './artifact-sweep.service';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';
import { ArtifactFolder } from './entities/artifact-folder.entity';
import { ArtifactShare } from './entities/artifact-share.entity';
import { Artifact } from './entities/artifact.entity';
import { WorkspaceStorageUsage } from './entities/workspace-storage-usage.entity';
import { PublicArtifactsController } from './public-artifacts.controller';

/** Workspace files ("artifacts"): uploads, sharing and the storage quota. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Artifact,
      ArtifactShare,
      ArtifactFolder,
      WorkspaceStorageUsage,
    ]),
  ],
  controllers: [
    ArtifactsController,
    ArtifactFoldersController,
    PublicArtifactsController,
  ],
  providers: [
    ArtifactsService,
    ArtifactFoldersService,
    ArtifactQuotaService,
    ArtifactSweepService,
  ],
  exports: [ArtifactsService, ArtifactQuotaService],
})
export class ArtifactsModule {}
