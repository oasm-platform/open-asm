import { BaseEntity } from 'src/common/entities/base.entity';
import { Role } from 'src/common/enums/enum';
import { McpPermission } from 'src/mcp/entities/mcp-permission.entity';
import { ToolProvider } from 'src/modules/providers/entities/provider.entity';
import { SearchHistory } from 'src/modules/search/entities/search-history.entity';
import { WorkspaceMembers } from 'src/modules/workspaces/entities/workspace-members.entity';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { Account } from './account.entity';
import { Session } from './session.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column('text')
  name: string;

  @Column('text', { unique: true })
  email: string;

  @Column('boolean')
  emailVerified: boolean;

  @Column('text', { nullable: true })
  image?: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.user,
  )
  workspaceMembers: WorkspaceMembers[];

  @OneToMany(() => Workspace, (workspace) => workspace.owner)
  workspaces: Workspace[];

  @Column('date', { nullable: true })
  banExpires: Date;

  @Column('boolean', { nullable: true })
  banned?: boolean;

  @Column('text', { nullable: true })
  banReason?: string;

  @OneToMany(() => SearchHistory, (searchHistory) => searchHistory.user)
  searchHistory: SearchHistory[];

  @OneToMany(() => ToolProvider, (toolProvider) => toolProvider.owner)
  toolProviders: ToolProvider[];

  @OneToMany(() => McpPermission, (mcpPermission) => mcpPermission.owner)
  mcpPermissions: McpPermission[];
}
