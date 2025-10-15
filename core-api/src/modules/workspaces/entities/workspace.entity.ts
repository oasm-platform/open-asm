import { BaseEntity } from '@/common/entities/base.entity';
import { ApiKey } from '@/modules/apikeys/entities/apikey.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Statistic } from '@/modules/statistic/entities/statistic.entity';
import { WorkspaceTarget } from '@/modules/targets/entities/workspace-target.entity';
import { Template } from '@/modules/templates/entities/templates.entity';
import { WorkspaceTool } from '@/modules/tools/entities/workspace_tools.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { WorkspaceMembers } from './workspace-members.entity';

@Entity('workspaces')
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
  owner: User;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.workspace,
  )
  workspaceMembers: WorkspaceMembers[];

  @OneToMany(
    () => WorkspaceTarget,
    (workspaceTarget) => workspaceTarget.workspace,
  )
  workspaceTargets: WorkspaceTarget[];

  @OneToMany(() => WorkspaceTool, (workspaceTool) => workspaceTool.workspace)
  workspaceTools: WorkspaceTool[];

  @DeleteDateColumn()
  deletedAt?: Date;

  @OneToMany(() => WorkerInstance, (workerInstance) => workerInstance.workspace)
  workers: WorkerInstance[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @OneToOne(() => ApiKey)
  @JoinColumn({ name: 'apiKeyId', referencedColumnName: 'id' })
  apiKey: ApiKey;

  @OneToMany(() => Template, (template) => template.workspace)
  templates: Template[];

  @OneToMany(() => Statistic, (statistic) => statistic.workspace)
  statistics: Statistic[];

  @ApiProperty({
    example: true,
    default: true,
    // name: 'Asset discovery',
    title: 'Asset discovery',
    description: 'Asset discovery is enabled for the workspace',
  })
  @IsBoolean()
  @Column({ default: true })
  isAssetsDiscovery: boolean;

  @ApiProperty({
    example: true,
    default: true,
    // name: 'Auto enable assets',
    title: 'Auto enable assets',
    description: 'Assets are automatically enabled after discovery',
  })
  @IsBoolean()
  @Column({ default: true })
  isAutoEnableAssetAfterDiscovered: boolean;
}