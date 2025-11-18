import { BaseEntity } from '@/common/entities/base.entity';
import { CronSchedule } from '@/common/enums/enum';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

@Entity('asset_group_workflows')
export class AssetGroupWorkflow extends BaseEntity {
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupWorkflows)
  @JoinColumn({ name: 'assetGroupId' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Workflow, (workflow) => workflow.id)
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column({ type: 'enum', enum: CronSchedule, default: CronSchedule.DAILY })
  schedule: CronSchedule;

  @OneToOne(() => Job)
  @JoinColumn({ name: 'jobId' })
  job: Job;
}
