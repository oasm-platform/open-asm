import { BaseEntity } from 'src/common/entities/base.entity';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { Assets } from 'src/modules/assets/entities/assets.entity';
import { Worker } from 'src/modules/workers/entities/worker.entity';
import { Column, Entity, ManyToOne, OneToOne } from 'typeorm';

@Entity('jobs')
export class Job extends BaseEntity {
  @ManyToOne(() => Assets, (asset) => asset.jobs, {
    onDelete: 'CASCADE',
  })
  asset: Assets;

  @Column({ type: 'enum', enum: WorkerName })
  workerName: WorkerName;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @Column({ nullable: true })
  pickJobAt: Date;

  @Column({ nullable: true })
  workerId: string;
}
