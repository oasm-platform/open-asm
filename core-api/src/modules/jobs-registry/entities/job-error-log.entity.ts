import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Job } from './job.entity';

@Entity()
export class JobErrorLog extends BaseEntity {
  @Column()
  logMessage: string;
  @Column()
  payload: string;
  @Column({ nullable: true })
  jobId: string;
  @ManyToOne(() => Job, (job) => job.errorLogs)
  job: Job;
}
