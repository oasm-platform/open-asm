import { BullMQName, NotificationEventType, NotificationStatus, NotificationType } from '@/common/enums/enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetGroupService } from '@/modules/asset-group/asset-group.service';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { AssetsService } from '@/modules/assets/assets.service';
import { Target } from '@/modules/targets/entities/target.entity';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

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
        key: NotificationEventType.SCAN_STARTED,
        metadata: { targetName: job.data.value || 'Target' },
      },
    );

    try {
      await this.assetService.reScan(targetId);

      await this.notificationsService.createNotification(
        recipientIds,
        NotificationType.GROUP,
        {
          key: NotificationEventType.SCAN_COMPLETED,
          metadata: { targetName: job.data.value || 'Target' },
        },
      );
    } catch (error) {
      // Notify Job Failed
      await this.notificationsService.createNotification(
        recipientIds,
        NotificationType.GROUP,
        {
          key: NotificationEventType.SCAN_FAILED,
          metadata: { targetName: job.data.value || 'Target' },
        },
      );
      throw error;
    }
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
    const assetGroupWorkflow = await this.assetGroupWorkflowRepo
      .createQueryBuilder('assetGroupWorkflow')
      .innerJoinAndSelect('assetGroupWorkflow.workflow', 'workflow')
      .innerJoinAndSelect('assetGroupWorkflow.assetGroup', 'assetGroup')
      .innerJoinAndSelect('assetGroup.workspace', 'workspace')
      .where('assetGroupWorkflow.id = :assetGroupWorkflowId', {
        assetGroupWorkflowId,
      })
      .getOne();

    if (assetGroupWorkflow) {
      const workspaceId = assetGroupWorkflow.assetGroup.workspace.id;
      const members =
        await this.workspacesService.getMembersByWorkspaceId(workspaceId);
      const recipientIds = members.map((m) => m.user.id);
      const workflowName = assetGroupWorkflow.workflow.name;

      await this.notificationsService.createNotification(
        recipientIds,
        NotificationType.GROUP,
        {
          key: NotificationEventType.WORKFLOW_RUN,
          metadata: { workflowName },
        },
      );
    }
    await this.assetGroupService.runGroupWorkflowScheduler(assetGroupWorkflowId);
  }
}
