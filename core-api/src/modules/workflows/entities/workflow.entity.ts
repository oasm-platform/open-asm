import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
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
  @ApiProperty()
  name: string;

  @ApiProperty()
  run: string;
}

export class WorkflowContent {
  @ApiProperty({ type: On })
  on: On;

  @ApiProperty({ type: [WorkflowJob] })
  jobs: WorkflowJob[];

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
