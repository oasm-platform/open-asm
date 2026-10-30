import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { Artifact } from '../artifacts/entities/artifact.entity';
import { AssetGroupAsset } from '../asset-group/entities/asset-groups-assets.entity';
import { StorageModule } from '../storage/storage.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([Artifact, AssetGroupAsset]), ArtifactsModule, StorageModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
