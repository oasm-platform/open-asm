import { BaseEntity } from '@/common/entities/base.entity';
import { CronSchedule } from '@/common/enums/enum';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AssetGroup } from './asset-groups.entity';
import { AssetGroupLastRunDto } from '../dto/asset-group-last-run.dto';

@Entity('asset_group_workflows')
@Index('IDX_agw_assetGroupId', ['assetGroup'])
@Index('IDX_agw_workflowId', ['workflow'])
export class AssetGroupWorkflow extends BaseEntity {
  @ApiProperty()
  @ManyToOne(() => AssetGroup, (assetGroup) => assetGroup.assetGroupWorkflows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetGroupId' })
  assetGroup: Relation<AssetGroup>;

  // Explicit FK column so the join id is available without loading the
  // relation (query builders only select it when the relation is joined).
  @Column({ name: 'assetGroupId', type: 'uuid' })
  assetGroupId: string;

  @ApiProperty({ type: () => Workflow })
  @ManyToOne(() => Workflow, (workflow) => workflow.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflowId' })
  workflow: Relation<Workflow>;

  // Stored as a plain string: the column is varchar and BullMQ accepts any
  // 5-field cron expression, so the schedule is no longer limited to the
  // fixed {@link CronSchedule} presets. "disabled" is the only disable value.
  @ApiProperty({
    example: '0 0 */3 * *',
    description:
      '5-field cron expression (UTC) or "disabled" to turn scheduling off',
  })
  @Column({ type: 'varchar', default: CronSchedule.DISABLED })
  schedule: string;

  @ApiProperty({ required: false, nullable: true })
  @Column({ type: 'varchar', nullable: true })
  jobId: string | null;

  @ApiProperty({ type: () => AssetGroupLastRunDto, required: false })
  lastRun?: AssetGroupLastRunDto | null;
}
