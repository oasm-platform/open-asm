import { BaseEntity } from 'src/common/entities/base.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { WorkspaceMembers } from './workspace-members.entity';
import { User } from 'src/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ description: 'The owner of the workspace' })
  @ManyToOne(() => User, (user) => user.workspaces)
  ownerId: User;

  @ApiProperty({ description: 'The members of the workspace' })
  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.workspace,
  )
  workspaceMembers: WorkspaceMembers[];

  @ApiProperty({ description: 'The date the workspace was softdeleted' })
  @DeleteDateColumn()
  deletedAt?: Date;
}
