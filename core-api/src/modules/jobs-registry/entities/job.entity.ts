import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { Asset } from 'src/modules/assets/entities/assets.entity';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('jobs')
export class Job extends BaseEntity {
  @ManyToOne(() => Asset, (asset) => asset.jobs, {
    onDelete: 'CASCADE',
  })
  asset: Asset;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerName })
  workerName: WorkerName;

  @ApiProperty()
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status?: JobStatus;

  @ApiProperty()
  @Column({ nullable: true })
  pickJobAt?: Date;

  @Column({ nullable: true })
  workerId?: string;

  @Column({ type: 'json', nullable: true })
  rawResult?: object;

  @ApiProperty()
  @Column({ nullable: true })
  completedAt?: Date;
}
