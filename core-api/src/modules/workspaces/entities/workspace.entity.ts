import { BaseEntity } from '@/common/entities/base.entity';
import { ApiKey } from '@/modules/apikeys/entities/apikey.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  Relation,
} from 'typeorm';
import { WorkspaceMembers } from './workspace-members.entity';
import { WorkspacePermission } from './workspace-permission.entity';

/** Workspace feature settings, one object per feature section */
export type WorkspaceSettings = Record<string, Record<string, unknown>>;

@Entity('workspaces')
@Index('IDX_workspaces_owner', ['owner'])
export class Workspace extends BaseEntity {
  @ApiProperty({
    example: 'My Workspace',
    description: 'The name of the workspace',
  })
  @IsString()
  @Column('text')
  name: string;

  @ApiProperty({
    example: 'This is my workspace',
    description: 'The description of the workspace',
  })
  @IsString()
  @Column('text', { nullable: true })
  description?: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  owner: Relation<User>;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.workspace,
  )
  workspaceMembers: Relation<WorkspaceMembers[]>;

  @OneToMany(
    () => WorkspacePermission,
    (permission) => permission.workspace,
  )
  permissions: Relation<WorkspacePermission[]>;

  @DeleteDateColumn()
  deletedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @OneToOne(() => ApiKey)
  @JoinColumn({ name: 'apiKeyId', referencedColumnName: 'id' })
  apiKey: Relation<ApiKey>;

  @ApiProperty({
    example: true,
    default: true,
    // name: 'Asset discovery',
    title: 'Asset discovery',
    description: 'Automatically scan and detect internet-facing assets (domains, IPs) in workspace networks',
  })
  @IsBoolean()
  @Column({ default: true })
  isAssetsDiscovery: boolean;

  @ApiProperty({
    example: true,
    default: true,
    // name: 'Auto enable assets',
    title: 'Auto enable assets',
    description: 'Newly discovered assets become active immediately without manual review',
  })
  @IsBoolean()
  @Column({ default: true })
  isAutoEnableAssetAfterDiscovered: boolean;

  @ApiProperty({
    description:
      'Encrypted Data Encryption Key (DEK) for this workspace. ' +
      'Encrypted with system KEK. Null for workspaces created before envelope encryption.',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Column('text', { nullable: true })
  dek?: string | null;

  @ApiProperty({
    description: 'Timestamp when DEK was generated',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @Column({ type: 'timestamp', nullable: true })
  dekAt?: Date | null;

  @ApiProperty({
    description: 'Workspace feature settings keyed by section',
    default: {},
  })
  @Column({ type: 'jsonb', default: {} })
  settings: WorkspaceSettings;
}
