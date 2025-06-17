import { ApiProperty } from '@nestjs/swagger';
import { Column, Generated, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export class BaseEntity {
  @ApiProperty({
    example: 'uuidv4',
    description: 'The id of the entity',
  })
  @PrimaryColumn({ type: 'uuid' })
  @Generated('uuid')
  id: string;

  @ApiProperty({ description: 'The date the entity was created' })
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ApiProperty({ description: 'The date the entity was updated' })
  @UpdateDateColumn()
  updatedAt: Date;
}
