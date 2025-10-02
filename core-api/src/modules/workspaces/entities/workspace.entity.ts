import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { ApiKey } from 'src/modules/apikeys/entities/apikey.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { WorkspaceTarget } from 'src/modules/targets/entities/workspace-target.entity';
import { WorkspaceTool } from 'src/modules/tools/entities/workspace_tools.entity';
import { WorkerInstance } from 'src/modules/workers/entities/worker.entity';
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
import { Template } from 'src/modules/templates/entities/templates.entity';

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
}
