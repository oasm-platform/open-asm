import { BaseEntity } from 'src/common/entities/base.entity';
import { Entity, ManyToOne } from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from 'src/modules/auth/entities/user.entity';

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
