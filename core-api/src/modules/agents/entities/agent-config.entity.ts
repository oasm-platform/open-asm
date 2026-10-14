import { BaseEntity } from '@/common/entities/base.entity';
import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { SearchProvider } from '../enums/agent.enums';

/** A model on one of the user's LLM connections, with its own limits. */
export interface AgentModelRef {
  llmConfigId: string;
  model: string;
  /** Overrides the default context window (128k) */
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface AgentModelsConfig {
  default?: AgentModelRef;
  /** Cheap model for titles, summaries and reports */
  small?: AgentModelRef;
  subagents?: AgentModelRef[];
}

export interface AgentSearchProviderConfig {
  provider: SearchProvider;
  /** Encrypted with the workspace DEK */
  apiKey: string;
  isDefault: boolean;
}

/** Agent settings of one user in one workspace. */
@Entity('agent_configs')
@Index('IDX_agent_config_workspace_user', ['workspaceId', 'userId'], {
  unique: true,
})
export class AgentConfig extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({ type: 'jsonb', default: {} })
  modelsConfig: AgentModelsConfig;

  @Column({ type: 'jsonb', default: [] })
  searchProviders: AgentSearchProviderConfig[];

  /** User instructions added to the system prompt, like an AGENTS.md */
  @Column({ type: 'text', nullable: true })
  instruction?: string | null;

  /** Max tool call steps per run */
  @Column({ type: 'int', nullable: true })
  maxSteps?: number | null;

  @Column({ type: 'varchar', nullable: true })
  defaultAgentMode?: AgentMode | null;

  @Column({ type: 'varchar', nullable: true })
  defaultApprovalMode?: AgentApprovalMode | null;

  /** Built-in tool names the agent must not get */
  @Column({ type: 'jsonb', default: [] })
  disabledTools: string[];

  /** Language the agent answers in, e.g. "vi" */
  @Column({ type: 'varchar', length: 16, nullable: true })
  responseLanguage?: string | null;
}
