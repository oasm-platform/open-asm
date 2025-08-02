import { BaseEntity } from 'src/common/entities/base.entity';
import { Entity, OneToMany } from 'typeorm';
import { Job } from './job.entity';

@Entity('job_histories')
export class JobHistory extends BaseEntity {
  @OneToMany(() => Job, (job) => job.asset, {
    onDelete: 'CASCADE',
  })
  jobs?: Job[];
}
