import { BaseEntity } from '@/common/entities/base.entity';
import { DataKind, ToolCategory } from '@/common/enums/enum';
import { ProjectWorkflow } from '@/modules/projects/entities/project-workflow.entity';
import { AssetsAddedTriggerConfig } from '@/modules/projects/entities/project-workflow-trigger.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';

/** One schedule of a workflow: a 5-field cron expression, in UTC. */
export class ScheduleOn {
  @ApiProperty({ example: '0 2 * * 1' })
  @IsString()
  cron: string;
}

/**
 * When a workflow runs on its own, like GitHub Actions' `on:`.
 *
 * - `target`: target events (`domain.create`, …); workspace workflows only.
 * - `schedule` and `assetsAdded`: project workflows only; each entry runs
 *   the workflow on the project's assets. See projects/workflow-on.ts.
 */
export class On {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target?: string[];

  @ApiProperty({ required: false, type: [ScheduleOn] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleOn)
  schedule?: ScheduleOn[];

  /** Run when assets join the project, gathered for a window. */
  @ApiProperty({ required: false, type: () => AssetsAddedTriggerConfig })
  @IsOptional()
  @IsObject()
  assetsAdded?: AssetsAddedTriggerConfig;
}

export class WorkflowJob {
  /**
   * Display label for the job. The job's identity — and what `needs` refers to
   * — is its key in the `jobs` map, which is unique within the workflow.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  run: string;

  /**
   * Category to run the tool in; omitted → the tool's first category. Required
   * on every job of a tool that runs in more than one job of the workflow.
   */
  @ApiProperty({ required: false, enum: ToolCategory, enumName: 'ToolCategory' })
  @IsOptional()
  @IsEnum(ToolCategory)
  category?: ToolCategory;

  /**
   * The kinds of data the job takes, best first (`[web, host]`): for each
   * asset, the first kind that has something is used. Omitted → the tool's
   * own `inputs`. A single kind may be written without the list. See
   * docs/workflows.md.
   */
  @ApiProperty({
    required: false,
    enum: DataKind,
    enumName: 'DataKind',
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @IsEnum(DataKind, { each: true })
  input?: DataKind[];

  /**
   * Ids of the jobs that must reach a terminal state before this one is
   * dispatched. Empty/absent means the job is a root and runs in parallel with
   * the other roots of the workflow.
   */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  needs?: string[];

  /**
   * Whether some of this job's fan-out jobs may fail without failing the job.
   * Defaults to true: a job that produced results is done, and the failed rows
   * stay visible in the job list. `false` fails the job when any of them fails.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowFailure?: boolean;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  configProfileId?: string;
}

/**
 * `ApiExtraModels(WorkflowJob)` registers the `WorkflowJob` schema — without it
 * the `additionalProperties` $ref on `jobs` points at a schema that is never
 * emitted.
 */
@ApiExtraModels(WorkflowJob)
export class WorkflowContent {
  /** When the workflow runs on its own. Absent: only when started. */
  @ApiProperty({ type: On, required: false })
  @ValidateNested()
  @Type(() => On)
  @IsOptional()
  on?: On;

  /**
   * Jobs keyed by a unique job id. `needs` on a job references those ids, so a
   * step never has to be addressed by a display name.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(WorkflowJob) },
    description:
      'Jobs keyed by a unique job id; `needs` references those same ids',
  })
  @IsObject()
  jobs: Record<string, WorkflowJob>;

  @ApiProperty()
  name: string;
}

@Entity('workflows')
@Index(['filePath', 'workspace'], { unique: true })
@Index('IDX_workflows_workspaceId', ['workspace'])
export class Workflow extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty({ type: () => WorkflowContent })
  @Column({ type: 'jsonb' })
  content: WorkflowContent;

  @ApiProperty()
  @Column()
  filePath: string;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdBy?: Relation<User>;

  @ManyToOne(() => Workspace, (workspace) => workspace.workflows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @OneToMany(() => JobHistory, (jobHistory) => jobHistory.workflow, {
    onDelete: 'CASCADE',
  })
  jobHistories?: JobHistory[];

  @OneToMany(() => ProjectWorkflow, (binding) => binding.workflow, {
    onDelete: 'CASCADE',
  })
  projectWorkflows?: Relation<ProjectWorkflow[]>;

  @ApiProperty()
  @Column({ default: true })
  isCanDelete: boolean;

  @ApiProperty()
  @Column({ default: true })
  isCanEdit: boolean;
}
