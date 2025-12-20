import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Job } from './job.entity';

@Entity()
export class JobErrorLog extends BaseEntity {
  @ApiProperty()
  @Column()
  logMessage: string;
  @ApiProperty()
  @Column()
  payload: string;
  @ApiProperty()
  @Column({ nullable: true })
  jobId: string;
  @ManyToOne(() => Job, (job) => job.errorLogs)
  job: Job;
}
