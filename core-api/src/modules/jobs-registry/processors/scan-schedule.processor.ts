import { BullMQName } from '@/common/enums/enum';
import { AssetGroupService } from '@/modules/asset-group/asset-group.service';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { AssetsService } from '@/modules/assets/assets.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { NotificationStatus, NotificationType } from '@/common/enums/enum';

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
    const workspaceId = await this.workspacesService.getWorkspaceIdByTargetId(targetId);
    
    if (!workspaceId) {
      await this.assetService.reScan(targetId);
      return;
    }

    const members = await this.workspacesService.getMembersByWorkspaceId(workspaceId);
    const recipientIds = members.map((m) => m.user.id);
    
    await this.notificationsService.createNotification(
      recipientIds,
      NotificationType.GROUP,
      {
        key: 'scan_started',
        metadata: { targetName: job.data.value || 'Target' },
      },
    );

    try {
      await this.assetService.reScan(targetId);

      await this.notificationsService.createNotification(
        recipientIds,
        NotificationType.GROUP,
        {
          key: 'scan_completed',
          metadata: { targetName: job.data.value || 'Target' },
        },
      );
    } catch (error) {
      // Notify Job Failed
      await this.notificationsService.createNotification(
        recipientIds,
        NotificationType.GROUP,
        {
          key: 'scan_failed',
          metadata: { targetName: job.data.value || 'Target' },
        },
      );
      throw error;
    }
  }
}

@Processor(BullMQName.ASSET_GROUPS_WORKFLOW_SCHEDULE)
export class AssetGroupsScheduleConsumer extends WorkerHost {
  constructor(private assetGroupService: AssetGroupService) {
    super();
  }
  async process(job: Job<AssetGroupWorkflow>): Promise<void> {
    await this.assetGroupService.runGroupWorkflowScheduler(job.data.id);
  }
}
