import { ApiProperty } from '@nestjs/swagger';
import { Column, Generated, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export class BaseEntity {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid' })
  @Generated('uuid')
  id: string;

  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
