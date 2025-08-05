import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Asset } from './assets.entity';
import { JobHistory } from 'src/modules/jobs-registry/entities/job-history.entity';
import { BaseEntity } from 'src/common/entities/base.entity';

@Entity('ports')
export class Port extends BaseEntity {
  @Column({ array: true, type: 'integer' })
  ports: number[];

  @Column({ type: 'varchar', nullable: true })
  assetId: string;

  @ManyToOne(() => Asset, (asset) => asset.ports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'varchar', nullable: true })
  jobHistoryId: string;

  @ManyToOne(() => JobHistory, (jobHistory) => jobHistory.ports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'jobHistoryId' })
  jobHistory: JobHistory;
}
