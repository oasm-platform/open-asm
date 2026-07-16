import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { TelegramConnect } from './telegram-connect.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
} from 'typeorm';

/**
 * Represents a third-party integration connected to a workspace.
 * Config is stored as JSONB and validated against JSON Schema per app_type + category.
 */
@Entity('integrations')
@Index('IDX_integrations_workspace', ['workspace'])
export class Integration extends BaseEntity {
  @ApiProperty({ example: 'My Jira Integration', description: 'Human-readable name' })
  @IsString()
  @Column('text')
  name: string;

  @ApiProperty({ required: false, description: 'Optional description' })
  @IsOptional()
  @IsString()
  @Column('text', { nullable: true })
  description?: string;

  @ApiProperty({ example: 'jira', description: 'Third-party app identifier' })
  @IsString()
  @Column('text')
  appType: string;

  @ApiProperty({ example: 'ticketing', description: 'Integration category' })
  @IsString()
  @Column('text')
  category: string;

  @ApiProperty({
    description: 'App-specific configuration validated via JSON Schema',
  })
  @Column('jsonb', { default: '{}' })
  config: Record<string, unknown>;

  @ApiProperty({ description: 'Workspace this integration belongs to' })
  @ManyToOne(() => Workspace, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column('uuid')
  workspaceId: string;

  @ApiProperty({ description: 'User who created this integration' })
  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User>;

  @Column('uuid', { nullable: true })
  createdById: string;

  @OneToMany(
    () => TelegramConnect,
    (telegramConnect) => telegramConnect.integration,
  )
  telegramConnects: Relation<TelegramConnect[]>;
}
