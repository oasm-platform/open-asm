import { BaseEntity } from '@/common/entities/base.entity';
import { ApiKey } from '@/modules/apikeys/entities/apikey.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Statistic } from '@/modules/statistic/entities/statistic.entity';
import { Template } from '@/modules/templates/entities/templates.entity';
import { WorkspaceTool } from '@/modules/tools/entities/workspace_tools.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { InternalNetwork } from '@/modules/internal-networks/entities/internal-network.entity';
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

  @ManyToOne(() => User, (user) => user.workspaces, { onDelete: 'CASCADE' })
  owner: Relation<User>;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.workspace,
  )
  workspaceMembers: Relation<WorkspaceMembers[]>;

  @OneToMany(() => WorkspaceTool, (workspaceTool) => workspaceTool.workspace)
  workspaceTools: Relation<WorkspaceTool[]>;

  @DeleteDateColumn()
  deletedAt?: Date;

  @OneToMany(() => WorkerInstance, (workerInstance) => workerInstance.workspace)
  workers: Relation<WorkerInstance[]>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @OneToOne(() => ApiKey)
  @JoinColumn({ name: 'apiKeyId', referencedColumnName: 'id' })
  apiKey: Relation<ApiKey>;

  @OneToMany(() => Template, (template) => template.workspace)
  templates: Relation<Template[]>;

  @OneToMany(() => Statistic, (statistic) => statistic.workspace)
  statistics: Relation<Statistic[]>;

  @OneToMany(() => Workflow, (workflow) => workflow.workspace)
  workflows: Relation<Workflow[]>;

  @OneToMany(
    () => InternalNetwork,
    (internalNetwork) => internalNetwork.workspace,
  )
  internalNetworks: Relation<InternalNetwork[]>;

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
}
