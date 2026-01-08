import { BaseEntity } from '@/common/entities/base.entity';
import { JobOutboxStatus } from '@/common/enums/enum';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { GetNextJobResponseDto } from '../dto/jobs-registry.dto';
import { Job } from './job.entity';

@Entity('jobs_outbox')
export class JobOutbox extends BaseEntity {
  @Column({ type: 'json' })
  payload: GetNextJobResponseDto;

  @Column({
    type: 'enum',
    enum: JobOutboxStatus,
    default: JobOutboxStatus.PENDING,
  })
  status: JobOutboxStatus;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Job;

  @Column()
  jobId: string;
}
