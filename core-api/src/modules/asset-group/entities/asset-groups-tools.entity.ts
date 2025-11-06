import { BaseEntity } from '@/common/entities/base.entity';
import { CronSchedule } from '@/common/enums/enum';
import { Job } from '@/modules/jobs-registry/entities/job.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

@Entity('asset_group_tools')
export class AssetGroupTool extends BaseEntity {
  @ManyToOne(() => AssetGroup, (ga) => ga.id)
  @JoinColumn({ name: 'asset_group_id' })
  assetGroup: AssetGroup;

  @ManyToOne(() => Tool, (tool) => tool.id)
  @JoinColumn({ name: 'tool_id' })
  tool: Tool;

  @Column({ type: 'enum', enum: CronSchedule, default: CronSchedule.DAILY })
  schedule: CronSchedule;

  @OneToOne(() => Job)
  @JoinColumn({ name: 'job_id' })
  job: Job;
}
