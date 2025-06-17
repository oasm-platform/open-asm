import { Column, Generated, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export class BaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  @Generated('uuid')
  id: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
