import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Asset } from '../assets/entities/assets.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AssetGroupController } from './asset-group.controller';
import { AssetGroupService } from './asset-group.service';
import { AssetGroup } from './entities/asset-groups.entity';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { Workflow } from '../workflows/entities/workflow.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      Job,
      AssetGroup,
      AssetGroupAsset,
      AssetGroupWorkflow,
      Workflow,
      Workspace,
    ]),
  ],
  controllers: [AssetGroupController],
  providers: [AssetGroupService],
  exports: [AssetGroupService],
})
export class AssetGroupModule {}
