import { BaseEntity } from '@/common/entities/base.entity';
import { AssetGroupWorkflow } from '@/modules/asset-group/entities/asset-groups-workflows.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

export interface WorkflowContent {
  on: On;
  jobs: Record<string, string[]>;
  name: string;
}

export interface On {
  target: string[];
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

  @ManyToOne(() => Workspace, (workspace) => workspace.id)
  @JoinColumn({ name: 'workspace_id' })
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
