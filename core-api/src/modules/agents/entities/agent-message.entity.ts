import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MessageRole, MessageType } from '../enums/agent.enums';
import { AgentConversation } from './agent-conversation.entity';
import { AgentMessageToolCall } from './tool-call.entity';

@Entity('agent_messages')
@Index('IDX_agent_msg_conversationId', ['conversation', 'createdAt'])
export class AgentMessage extends BaseEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  conversationId: string;

  @ApiProperty({ enum: MessageRole, example: MessageRole.USER })
  @IsEnum(MessageRole)
  @Column({ type: 'enum', enum: MessageRole })
  role: MessageRole;

  @ApiProperty({ example: 'Hello, how can you help me?' })
  @IsString()
  @Column('text')
  content: string;

  @ApiProperty({
    enum: MessageType,
    example: MessageType.TEXT,
    default: MessageType.TEXT,
  })
  @IsEnum(MessageType)
  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  messageType: MessageType;

  @ApiProperty({
    required: false,
    description: 'Token usage, model info, etc.',
  })
  @IsOptional()
  @IsObject()
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      'Chronological parts array preserving the real order of reasoning, tool calls, and text from the AI stream.',
  })
  @IsOptional()
  @IsArray()
  @Column({ type: 'jsonb', nullable: true })
  parts?: Record<string, unknown>[];

  @OneToMany(() => AgentMessageToolCall, (tc) => tc.message, {
    cascade: true,
  })
  toolCalls?: AgentMessageToolCall[];

  @ManyToOne(() => AgentConversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: AgentConversation;
}
