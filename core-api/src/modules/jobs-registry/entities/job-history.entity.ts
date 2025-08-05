import { BaseEntity } from 'src/common/entities/base.entity';
import { Entity, OneToMany } from 'typeorm';
import { Job } from './job.entity';
import { Port } from 'src/modules/assets/entities/ports.entity';
import { Httpx } from 'src/modules/assets/entities/httpxs.entity';

@Entity('job_histories')
export class JobHistory extends BaseEntity {
  @OneToMany(() => Job, (job) => job.asset, {
    onDelete: 'CASCADE',
  })
  jobs?: Job[];

  @OneToMany(() => Port, (port) => port.jobHistory, {
    onDelete: 'CASCADE',
  })
  ports?: Port[];

  @OneToMany(() => Httpx, (httpx) => httpx.jobHistory, {
    onDelete: 'CASCADE',
  })
  httpxs?: Httpx[];
}
