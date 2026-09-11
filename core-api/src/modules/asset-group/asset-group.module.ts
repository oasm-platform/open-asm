import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { JobHistory } from '../jobs-registry/entities/job-history.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AssetGroupController } from './asset-group.controller';
import { AssetGroupAssetService } from './asset-group-asset.service';
import { AssetGroupService } from './asset-group.service';
import { AssetGroupWorkflowService } from './asset-group-workflow.service';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE,
    }),
    TypeOrmModule.forFeature([
      Asset,
      Job,
      AssetGroup,
      AssetGroupAsset,
      AssetGroupWorkflow,
      Workflow,
      Workspace,
      JobHistory,
    ]),
    ConnectorsModule,
  ],
  controllers: [AssetGroupController],
  providers: [AssetGroupService, AssetGroupWorkflowService, AssetGroupAssetService],
  exports: [AssetGroupService, AssetGroupWorkflowService, AssetGroupAssetService],
})
export class AssetGroupModule {}
