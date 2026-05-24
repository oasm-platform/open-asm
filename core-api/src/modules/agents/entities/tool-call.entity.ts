import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AgentConversation } from './agent-conversation.entity';
import { AgentMessage } from './agent-message.entity';

@Entity('agent_message_tool_calls')
@Index('idx_tc_conversation', ['conversationId'])
@Index('idx_tc_message', ['messageId'])
@Index('idx_tc_tool_name', ['toolName'])
export class AgentMessageToolCall extends BaseEntity {
  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar', length: 255 })
  toolCallId: string;

  @Column({ type: 'varchar', length: 255 })
  toolName: string;

  @Column({ type: 'jsonb' })
  args: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  isError: boolean;

  @Column({ type: 'integer', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'uuid', nullable: true })
  workerId?: string | null;

  @ManyToOne(() => AgentMessage, (msg) => msg.toolCalls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: AgentMessage;

  @ManyToOne(() => AgentConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: AgentConversation;
}
