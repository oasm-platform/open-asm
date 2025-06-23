import { BaseEntity } from 'src/common/entities/base.entity';
import { WorkerName, WorkerName as WorkerNameId } from 'src/common/enums/enum';
import { Job } from 'src/modules/jobs-registry/entities/job.entity';
import { Column, Entity, OneToOne } from 'typeorm';

@Entity('workers')
export class Worker extends BaseEntity {
  @Column({ type: 'enum', enum: WorkerNameId })
  workerName: WorkerName;

  @Column({ type: 'int', unique: false })
  workerIndex: number;
}
