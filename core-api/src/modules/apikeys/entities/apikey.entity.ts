import { BaseEntity } from '@/common/entities/base.entity';
import { ApiKeyType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Column, Entity } from 'typeorm';

@Entity('api_keys')
export class ApiKey extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ unique: true })
  key: string;

  @ApiProperty({ enum: ApiKeyType })
  @Column({ type: 'enum', enum: ApiKeyType })
  type: ApiKeyType;

  @Column({ nullable: true })
  @IsUUID()
  ref: string;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date;

  @ApiProperty()
  @Column({ type: 'boolean', default: false })
  isRevoked: boolean;
}
