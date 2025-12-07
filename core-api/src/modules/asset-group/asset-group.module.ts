import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Asset } from '../assets/entities/assets.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AssetGroupController } from './asset-group.controller';
import { AssetGroupService } from './asset-group.service';
import { AssetGroupAsset } from './entities/asset-groups-assets.entity';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroupWorkflowSubscriber } from './entities/asset-groups-workflows.subscriber';
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
    ]),
  ],
  controllers: [AssetGroupController],
  providers: [AssetGroupService, AssetGroupWorkflowSubscriber],
  exports: [AssetGroupService],
})
export class AssetGroupModule {}
