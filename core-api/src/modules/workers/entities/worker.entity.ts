import { BaseEntity } from 'src/common/entities/base.entity';
import { WorkerName } from 'src/common/enums/enum';
import { Column, Entity } from 'typeorm';

@Entity('workers')
export class WorkerInstance extends BaseEntity {
  @Column({ nullable: false })
  workerName: WorkerName;

  @Column({ type: 'int', unique: false })
  workerIndex: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSeenAt: Date;

  @Column({ nullable: true })
  token: string;
}
