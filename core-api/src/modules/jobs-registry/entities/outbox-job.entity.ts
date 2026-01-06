import { BaseEntity } from '@/common/entities/base.entity';
import { JobPriority } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { Job } from './job.entity';

@Entity('outbox_jobs')
export class OutboxJob extends BaseEntity {
    /**
     * The priority of the job.
     */
    @Column({ type: 'enum', enum: JobPriority, default: JobPriority.BACKGROUND })
    priority: JobPriority;

    /**
     * The associated Job.
     */
    @ApiProperty({ type: () => Job })
    @OneToOne(() => Job, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'jobId' })
    job: Job;

    @Column()
    jobId: string;
}
