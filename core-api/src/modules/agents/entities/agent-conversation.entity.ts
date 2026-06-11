// import { BaseEntity } from '@/common/entities/base.entity';
import { AgentMode } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AgentConversationTodo } from './agent-conversation-todo.entity';
import { AgentMessage } from './agent-message.entity';

@Entity('agent_conversations')
@Index('IDX_agent_conv_workspaceId', ['workspaceId'])
@Index('IDX_agent_conv_createdBy', ['createdBy'])
export class AgentConversation {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  llmConfigId: string;

  @ApiProperty({ example: 'My conversation', required: false })
  @IsOptional()
  @IsString()
  @Column({ type: 'varchar', length: 500, nullable: true })
  title?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  createdBy: string;

  @OneToMany(() => AgentMessage, (message) => message.conversation)
  messages: AgentMessage[];

  @OneToMany(() => AgentConversationTodo, (todo) => todo.conversation)
  todoItems: AgentConversationTodo[];

  @ApiProperty({ example: AgentMode.ASK })
  @IsEnum(AgentMode)
  @Column({ default: AgentMode.ASK })
  agentMode: AgentMode;

  @ApiProperty({
    description: 'Summarized context of previous conversation turns',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  summary?: string;

  @ApiProperty({ description: 'Pinned worker for remote execution', required: false })
  @IsOptional()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  workerId?: string;
}
