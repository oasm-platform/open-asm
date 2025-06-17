import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { WorkspaceMembers } from './workspace-members.entity';

@Entity('workspace')
export class Workspace extends BaseEntity {
  @ApiProperty({
    example: 'My Workspace',
    description: 'The name of the workspace',
  })
  @Column('text')
  name: string;

  @ApiProperty({
    example: 'This is my workspace',
    description: 'The description of the workspace',
  })
  @Column('text', { nullable: true })
  description?: string;

  @ManyToOne(() => User, (user) => user.workspaces)
  ownerId: User;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.workspace,
  )
  workspaceMembers: WorkspaceMembers[];

  @DeleteDateColumn()
  deletedAt?: Date;
}
