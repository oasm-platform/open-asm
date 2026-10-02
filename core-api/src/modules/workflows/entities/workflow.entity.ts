import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';

export class On {
  @ApiProperty()
  target?: string[];
  // Plain string: arbitrary 5-field cron expressions are written into this
  // JSONB content field (e.g. from asset-group workflow creation).
  @ApiProperty({ example: '0 0 * * *' })
  @IsOptional()
  schedule?: string;
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
  @ApiProperty({ type: On })
  @ValidateNested()
  @Type(() => On)
  on: On;

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
  @Column()
  name: string;

  @ApiProperty({ type: () => WorkflowContent })
  @Column({ type: 'jsonb' })
  content: WorkflowContent;

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

  @OneToMany(() => AssetGroupWorkflow, (agt) => agt.workflow, {
    onDelete: 'CASCADE',
  })
  assetGroupWorkflows?: Relation<AssetGroupWorkflow[]>;

  @ApiProperty()
  @Column({ default: true })
  isCanDelete: boolean;

  @ApiProperty()
  @Column({ default: true })
  isCanEdit: boolean;
}
