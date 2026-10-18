import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import {
  AgentDefinitionMode,
  AgentDefinitionScope,
} from '../enums/agent.enums';

/** Model, sampling and capability overrides of an agent definition. */
export interface AgentDefinitionMetadata {
  /** Unset: the user's default model */
  model?: { llmConfigId: string; model: string };
  /** Provider thinking variant, e.g. "high" */
  variant?: string;
  temperature?: number;
  topP?: number;
  /** Max tool call steps per run */
  maxSteps?: number;
  /** Tool allowlist; unset: every tool of the mode */
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
}

/**
 * A user-defined agent persona, mentioned as `@name`. Built-in agents live in
 * `builtin-agents/*.md`, only custom ones are stored here.
 *
 * `name` is unique per creator in a workspace, and workspace-scoped names are
 * unique in the workspace; the service also keeps a personal agent from
 * shadowing a workspace one so `@name` always resolves to one agent.
 */
@Entity('agent_definitions')
@Index(
  'IDX_agent_definition_workspace_creator_name',
  ['workspaceId', 'createdBy', 'name'],
  { unique: true },
)
@Index('IDX_agent_definition_workspace_name', ['workspaceId', 'name'], {
  unique: true,
  where: `"scope" = 'workspace'`,
})
export class AgentDefinition extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator?: Relation<User>;

  /** USER: only the creator sees it; WORKSPACE: every member does */
  @Column({ type: 'varchar', length: 20, default: AgentDefinitionScope.USER })
  scope: AgentDefinitionScope.USER | AgentDefinitionScope.WORKSPACE;

  /** Slug used as the `@name` mention */
  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 20, default: AgentDefinitionMode.ALL })
  mode: AgentDefinitionMode;

  @Column({ type: 'text', default: '' })
  systemPrompt: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: AgentDefinitionMetadata;
}
