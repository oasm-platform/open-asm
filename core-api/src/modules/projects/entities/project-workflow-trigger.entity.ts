import { BaseEntity } from '@/common/entities/base.entity';
import { ProjectTriggerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { ProjectWorkflow } from './project-workflow.entity';

/** Settings of an `assets_added` trigger. */
export class AssetsAddedTriggerConfig {
  /** Minutes to wait after the first new asset before starting one run. */
  @ApiProperty({ required: false, minimum: 0, maximum: 1440 })
  windowMinutes?: number;

  /** Most assets one run takes; the rest start another run right after. */
  @ApiProperty({ required: false, minimum: 1, maximum: 5000 })
  maxAssets?: number;

  /** Only assets of these target types ("domain", "ip", …); empty = all. */
  @ApiProperty({ required: false, type: [String] })
  targetTypes?: string[];
}

/**
 * When a project workflow runs on its own: on a cron schedule, or when assets
 * join the project. Disabling keeps the settings and only unregisters the
 * BullMQ scheduler (cron) or makes the dispatcher skip it (assets added).
 */
@Entity('project_workflow_triggers')
@Index('IDX_pwt_projectWorkflowId', ['projectWorkflowId'])
export class ProjectWorkflowTrigger extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  projectWorkflowId: string;

  @ManyToOne(() => ProjectWorkflow, (binding) => binding.triggers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectWorkflowId' })
  projectWorkflow: Relation<ProjectWorkflow>;

  @ApiProperty({ enum: ProjectTriggerType, enumName: 'ProjectTriggerType' })
  @Column({ type: 'varchar' })
  type: ProjectTriggerType;

  /** 5-field cron expression in UTC; set for `cron` triggers only. */
  @ApiProperty({ type: String, required: false, nullable: true })
  @Column({ type: 'varchar', nullable: true })
  cron: string | null;

  @ApiProperty({ type: () => AssetsAddedTriggerConfig })
  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: AssetsAddedTriggerConfig;

  @ApiProperty()
  @Column({ default: true })
  enabled: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true })
  lastFiredAt: Date | null;

  /** BullMQ job scheduler id while a cron trigger is registered. */
  @Column({ type: 'varchar', nullable: true })
  schedulerId: string | null;
}
