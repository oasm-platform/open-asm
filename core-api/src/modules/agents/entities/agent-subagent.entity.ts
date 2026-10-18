import { BaseEntity } from '@/common/entities/base.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  VersionColumn,
} from 'typeorm';
import { SubagentStatus } from '../enums/agent.enums';
import type { SubagentMetadata } from '../shared/conversation-metadata';
import { AgentConversation } from './agent-conversation.entity';

/**
 * A task the main agent delegated to a background subagent. The table is both
 * the task store and the queue: rows are claimed atomically
 * (pending -> in_progress) by the in-process drain.
 */
@Entity('agent_subagents')
@Index('IDX_agent_subagent_conversation', ['conversationId'])
@Index('IDX_agent_subagent_status_created', ['status', 'createdAt'])
export class AgentSubagent extends BaseEntity {
  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => AgentConversation, (conv) => conv.subagents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Relation<AgentConversation>;

  /** Subagent key from the instruction frontmatter. */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Where the instructions came from: `builtin-agents/<name>.md` or `agent_definitions/<id>`. */
  @Column({ type: 'varchar', length: 255 })
  instructionFile: string;

  /** Task text dispatched by the main agent (treated as data). */
  @Column({ type: 'text' })
  task: string;

  @Column({ type: 'varchar', length: 20, default: SubagentStatus.PENDING })
  status: SubagentStatus;

  @Column({ type: 'text', nullable: true })
  result: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Provider/model, token usage and run stats. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: SubagentMetadata | null;

  /** When the main agent consumed the result. */
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @VersionColumn()
  version: number;
}
