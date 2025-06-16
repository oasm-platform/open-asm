import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from 'src/modules/auth/entities/user.entity';

@Entity()
export class WorkspaceMembers extends BaseEntity {
  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceMembers)
  workspace: Workspace;

  @ManyToOne(() => User, (user) => user.workspaceMembers)
  user: User;
}
