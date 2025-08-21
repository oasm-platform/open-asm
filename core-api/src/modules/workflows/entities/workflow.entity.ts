import { BaseEntity } from 'src/common/entities/base.entity';
import { JobHistory } from 'src/modules/jobs-registry/entities/job-history.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';

@Entity('workflows')
@Index(['filePath'], { unique: true })
export class Workflow extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  content: Record<string, any>;

  @Column()
  filePath: string;

  @OneToMany(() => JobHistory, (jobHistory) => jobHistory.workflow, {
    onDelete: 'CASCADE',
  })
  jobHistories?: JobHistory[];
}
