import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { Artifact } from '../artifacts/entities/artifact.entity';
import { ProjectAsset } from '../projects/entities/project-asset.entity';
import { StorageModule } from '../storage/storage.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([Artifact, ProjectAsset]), ArtifactsModule, StorageModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  // The agent tool save_template creates templates through it
  exports: [TemplatesService],
})
export class TemplatesModule {}
