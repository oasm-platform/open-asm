import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';

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

  @OneToMany(() => JobHistory, (jobHistory) => jobHistory.workflow, {
    onDelete: 'CASCADE',
  })
  jobHistories?: JobHistory[];
}
