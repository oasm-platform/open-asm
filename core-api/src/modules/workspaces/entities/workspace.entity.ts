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

@Entity()
export class Workspace extends BaseEntity {
  @Column('text')
  name: string;

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
