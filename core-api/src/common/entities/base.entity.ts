import { ApiProperty } from '@nestjs/swagger';
import { Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export class BaseEntity {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid', default: () => `${uuidv7()}` })
  id: string;

  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
