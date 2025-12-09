import { BullMQName } from '@/common/enums/enum';
import { AssetGroupService } from '@/modules/asset-group/asset-group.service';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { AssetsService } from '@/modules/assets/assets.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';

import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';

@Processor(BullMQName.ASSETS_DISCOVERY_SCHEDULE)
export class AssetsDiscoveryScheduleConsumer extends WorkerHost {
  constructor(
    private assetService: AssetsService,
    private notificationsService: NotificationsService,
    private workspacesService: WorkspacesService,
  ) {
    super();
  }

  async process(job: Job<Target>): Promise<void> {
    const targetId = job.data.id;
    const workspaceId =
      await this.workspacesService.getWorkspaceIdByTargetId(targetId);

    if (!workspaceId) {
      await this.assetService.reScan(targetId);
      return;
    }

    await this.assetService.reScan(targetId);
  }
}

@Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
export class AssetGroupsScheduleConsumer extends WorkerHost {
  constructor(
    private assetGroupService: AssetGroupService,
    private notificationsService: NotificationsService,
    private workspacesService: WorkspacesService,
    @InjectRepository(AssetGroupWorkflow)
    private assetGroupWorkflowRepo: Repository<AssetGroupWorkflow>,
  ) {
    super();
  }
  async process(job: Job<AssetGroupWorkflow>): Promise<void> {
    const assetGroupWorkflowId = job.data.id;
    await this.assetGroupService.runGroupWorkflowScheduler(
      assetGroupWorkflowId,
    );
  }
}
