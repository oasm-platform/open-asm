import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Job } from './job.entity';

export enum JobOutboxStatus {
  PENDING = 'pending',
  SENT = 'sent',
  ERROR = 'error',
}

@Entity('jobs_outbox')
export class JobOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'json' })
  payload: any;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}