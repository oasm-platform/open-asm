import { BaseEntity } from '@/common/entities/base.entity';
import { WorkspaceRole } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Workspace } from './workspace.entity';

@Entity('workspace_members')
@Index('IDX_wm_workspace_user', ['workspace', 'user'])
@Index('IDX_wm_userId', ['user'])
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

  @Column({ type: 'enum', enum: WorkspaceRole, default: WorkspaceRole.OWNER })
  role: WorkspaceRole;
}
