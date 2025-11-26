import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';



export class On {
  @ApiProperty()
  target: string[];
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
@Index(['filePath'], { unique: true })
export class Workflow extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  content: WorkflowContent;

  @Column()
  filePath: string;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdBy?: User;

  @ManyToOne(() => Workspace, (workspace) => workspace.id)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @OneToMany(() => JobHistory, (jobHistory) => jobHistory.workflow, {
    onDelete: 'CASCADE',
  })
  jobHistories?: JobHistory[];

  @OneToMany(() => AssetGroupWorkflow, (agt) => agt.workflow, {
    onDelete: 'CASCADE',
  })
  assetGroupWorkflows?: AssetGroupWorkflow[];
}
