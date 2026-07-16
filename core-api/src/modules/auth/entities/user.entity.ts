import { BaseEntity } from '@/common/entities/base.entity';
import { Role } from '@/common/enums/enum';
import { InternalNetwork } from '@/modules/internal-networks/entities/internal-network.entity';
import { TelegramConnect } from '@/modules/integrations/entities/telegram-connect.entity';
import { ToolProvider } from '@/modules/providers/entities/provider.entity';
import { SearchHistory } from '@/modules/search/entities/search-history.entity';
import { VulnerabilityDismissal } from '@/modules/vulnerabilities/entities/vulnerability-dismissal.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import { WorkspaceMembers } from '@/modules/workspaces/entities/workspace-members.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, Relation } from 'typeorm';
import { Account } from './account.entity';
import { Session } from './session.entity';

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty()
  @Column('text')
  name: string;

  @Column('text', { unique: true })
  email: string;

  @Column('boolean')
  emailVerified: boolean;

  @Column('text', { nullable: true })
  image?: string;

  @ApiProperty({ enum: Role })
  @Column({ type: 'varchar', default: Role.USER })
  role: Role;

  @Column({ type: 'text', default: 'en' })
  language: string;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Relation<Session[]>;

  @OneToMany(() => Account, (account) => account.user)
  accounts: Relation<Account[]>;

  @OneToMany(
    () => WorkspaceMembers,
    (workspaceMembers) => workspaceMembers.user,
  )
  workspaceMembers: Relation<WorkspaceMembers[]>;

  @OneToMany(() => Workspace, (workspace) => workspace.owner)
  workspaces: Relation<Workspace[]>;

  @Column('date', { nullable: true })
  banExpires: Date;

  @Column('boolean', { nullable: true })
  banned?: boolean;

  @Column('text', { nullable: true })
  banReason?: string;

  @OneToMany(() => SearchHistory, (searchHistory) => searchHistory.user)
  searchHistory: Relation<SearchHistory[]>;

  @OneToMany(() => ToolProvider, (toolProvider) => toolProvider.owner)
  toolProviders: Relation<ToolProvider[]>;

  @OneToMany(() => Workflow, (workflow) => workflow.createdBy)
  createdWorkflows: Relation<Workflow[]>;

  @OneToMany(
    () => InternalNetwork,
    (internalNetwork) => internalNetwork.creator,
  )
  createdInternalNetworks: Relation<InternalNetwork[]>;

  @OneToMany(
    () => VulnerabilityDismissal,
    (vulnerabilityDismissal) => vulnerabilityDismissal.user,
  )
  vulnerabilityDismissals: Relation<VulnerabilityDismissal[]>;

  @OneToMany(
    () => TelegramConnect,
    (telegramConnect) => telegramConnect.user,
  )
  telegramConnects: Relation<TelegramConnect[]>;
}
