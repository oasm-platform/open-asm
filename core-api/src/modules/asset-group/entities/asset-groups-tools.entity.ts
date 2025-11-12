import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { CronSchedule } from '@/common/enums/enum';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { AssetGroup } from './asset-groups.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';

@Entity('asset_group_tools')
export class AssetGroupTool extends BaseEntity {
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupTools)
  @JoinColumn({ name: 'asset_group_id' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Workflow, (workflow) => workflow.id)
  @JoinColumn({ name: 'workflow_id' })
  workflow: Workflow;

  @Column({ type: 'enum', enum: CronSchedule, default: CronSchedule.DAILY })
  schedule: CronSchedule;

  @OneToOne(() => Job)
  @JoinColumn({ name: 'job_id' })
  job: Job;
}
