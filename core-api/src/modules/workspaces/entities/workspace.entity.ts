import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { WorkspaceTarget } from 'src/modules/targets/entities/workspace-target.entity';
import { WorkspaceTool } from 'src/modules/tools/entities/workspace_tools.entity';
import { WorkerInstance } from 'src/modules/workers/entities/worker.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
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

  @ApiProperty({
    example: '1234567890',
    description: 'The API key of the workspace',
  })
  @Column('text', { nullable: true })
  apiKey?: string;

  @OneToMany(() => WorkerInstance, (workerInstance) => workerInstance.workspace)
  workers: WorkerInstance[];
}
