import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Entity, ManyToOne } from 'typeorm';
import { Workspace } from './workspace.entity';

@Entity('workspace_members')
export class WorkspaceMembers extends BaseEntity {
  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceMembers, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @ManyToOne(() => User, (user) => user.workspaceMembers, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  user: User;
}
