import { BaseEntity } from '@/common/entities/base.entity';
import { HttpResponse } from '@/modules/assets/entities/http-response.entity';
import { Port } from '@/modules/assets/entities/ports.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { Entity, ManyToOne, OneToMany } from 'typeorm';
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

  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.jobHistory, {
    onDelete: 'CASCADE',
  })
  vulnerabilities?: Vulnerability[];

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.jobHistory, {
    onDelete: 'CASCADE',
  })
  httpResponses?: HttpResponse[];

  @ManyToOne(() => Workflow, (workflow) => workflow.jobHistories, {
    onDelete: 'CASCADE',
  })
  workflow?: Workflow;
}
