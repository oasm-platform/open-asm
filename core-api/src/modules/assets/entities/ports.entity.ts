import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Asset } from './assets.entity';

@Entity('ports')
export class Port extends BaseEntity {
  @ApiProperty()
  @Column({ array: true, type: 'integer' })
  ports: number[];

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.ports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.ports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: JobHistory;
}
