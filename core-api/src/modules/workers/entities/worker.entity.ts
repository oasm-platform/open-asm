import { BaseEntity } from 'src/common/entities/base.entity';
import { WorkerName, WorkerName as WorkerNameId } from 'src/common/enums/enum';
import { Column, Entity } from 'typeorm';

@Entity('workers')
export class Worker extends BaseEntity {
  @Column({ type: 'enum', enum: WorkerNameId })
  workerName: WorkerName;

  @Column({ type: 'int', unique: false })
  workerIndex: number;
}
