import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, IsUUID } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  VersionColumn,
} from 'typeorm';
import { AgentConversation } from './agent-conversation.entity';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

@Entity('agent_conversation_todos')
@Index('IDX_agent_conv_todo_conversation', ['conversationId'])
@Index('IDX_agent_conv_todo_status', ['status'])
export class AgentConversationTodo extends BaseEntity {
  @ApiProperty()
  @IsUUID()
  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => AgentConversation, (conv) => conv.todoItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: AgentConversation;

  @ApiProperty({ example: 'Enumerate subdomains for target' })
  @IsString()
  @Column({ type: 'text' })
  content: string;

  @ApiProperty({ enum: ['pending', 'in_progress', 'completed', 'failed'] })
  @IsEnum(['pending', 'in_progress', 'completed', 'failed'] as const)
  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status: TodoStatus;

  @ApiProperty({ description: 'Order of the todo in the plan', default: 0 })
  @IsNumber()
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ description: 'Optimistic lock version (auto-incremented by TypeORM)' })
  @VersionColumn()
  version: number;
}
