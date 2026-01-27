import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

/**
 * System configuration entity - singleton pattern
 * Only one record exists in this table for system-wide settings
 */
@Entity('system_configs')
export class SystemConfig extends BaseEntity {
  @ApiProperty({ description: 'System name', default: 'Open ASM' })
  @Column('text', { default: 'Open ASM' })
  name: string;

  @ApiProperty({ description: 'Path to system logo', nullable: true })
  @Column('text', { nullable: true })
  logoPath?: string;
}
