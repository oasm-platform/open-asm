import { BaseEntity } from 'src/common/entities/base.entity';
import { WorkerNameId as WorkerNameId } from 'src/common/enums/enum';
import { Column, Entity } from 'typeorm';

@Entity('workers')
export class Worker extends BaseEntity {
  @Column({ type: 'enum', enum: WorkerNameId })
  workerName: WorkerNameId;

  @Column({ type: 'int', unique: false })
  workerIndex: number;
}
