import { BaseEntity } from 'src/common/entities/base.entity';
import { HttpResponse } from 'src/modules/assets/entities/http-response.entity';
import { Port } from 'src/modules/assets/entities/ports.entity';
import { Entity, OneToMany } from 'typeorm';
import { Job } from './job.entity';

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

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.jobHistory, {
    onDelete: 'CASCADE',
  })
  httpResponses?: HttpResponse[];
}
