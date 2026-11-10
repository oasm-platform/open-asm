import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AgentConversation } from './agent-conversation.entity';

export type WorkflowNoteKind = 'fact' | 'decision' | 'issue';
export const WORKFLOW_NOTE_KINDS: readonly WorkflowNoteKind[] = [
  'fact',
  'decision',
  'issue',
];

/**
 * One entry of a conversation's shared notebook: what the main agent and its
 * subagents learned, decided or could not resolve. Append-only: rows are
 * never updated, so every subagent dispatched later reads the same history.
 */
@Entity('agent_workflow_notes')
@Index('IDX_agent_workflow_note_conversation', ['conversationId', 'createdAt'])
export class AgentWorkflowNote extends BaseEntity {
  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => AgentConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Relation<AgentConversation>;

  /** Subagent that wrote it; null when the main agent did. */
  @Column({ type: 'uuid', nullable: true })
  subagentId: string | null;

  /** Plan step it belongs to, when known. */
  @Column({ type: 'uuid', nullable: true })
  stepId: string | null;

  @Column({ type: 'varchar', length: 20 })
  kind: WorkflowNoteKind;

  /** Stable short key (e.g. `host:api.example.com`), so later notes can refer to it. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  key: string | null;

  @Column({ type: 'text' })
  content: string;

  /** Subagent name, or `main` for the main agent. */
  @Column({ type: 'varchar', length: 100 })
  author: string;
}
