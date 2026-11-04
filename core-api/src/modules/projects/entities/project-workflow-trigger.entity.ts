import { BaseEntity } from '@/common/entities/base.entity';
import { ProjectTriggerEvent, ProjectTriggerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { ProjectWorkflow } from './project-workflow.entity';

/**
 * Settings of an event trigger. Every event gathers the assets it brings for
 * `windowMinutes` and starts one run per `maxAssets` of them; the filters
 * below apply to one event each.
 */
export class EventTriggerConfig {
  /**
   * Minutes to gather assets before starting a run. One batch is open at a
   * time, so it is also the least time between two runs of the trigger.
   */
  @ApiProperty({ required: false, minimum: 0, maximum: 1440 })
  windowMinutes?: number;

  /** Most assets one run takes; the rest start another run right after. */
  @ApiProperty({ required: false, minimum: 1, maximum: 5000 })
  maxAssets?: number;

  /** Only assets of these target types ("domain", "ip", …); empty = all. */
  @ApiProperty({ required: false, type: [String] })
  targetTypes?: string[];

  /** `project.run.completed`: names of the workflows to follow; empty = any other. */
  @ApiProperty({ required: false, type: [String] })
  workflows?: string[];

  /** `project.run.completed`: run outcomes that start a run ("success", "failure"). */
  @ApiProperty({ required: false, type: [String] })
  status?: string[];

  /** `vulnerability.detected`: severities that start a run. */
  @ApiProperty({ required: false, type: [String] })
  severity?: string[];
}

/**
 * When a project workflow runs on its own: on a cron schedule, or on an event
 * (assets joined the project, another workflow's run finished, a
 * vulnerability was found). Disabling keeps the settings and only unregisters
 * the BullMQ scheduler (cron) or makes the dispatcher skip it (event).
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

  /** The event it runs on; set for `event` triggers only. */
  @ApiProperty({
    enum: ProjectTriggerEvent,
    enumName: 'ProjectTriggerEvent',
    required: false,
    nullable: true,
  })
  @Column({ type: 'varchar', nullable: true })
  event: ProjectTriggerEvent | null;

  @ApiProperty({ type: () => EventTriggerConfig })
  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: EventTriggerConfig;

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
