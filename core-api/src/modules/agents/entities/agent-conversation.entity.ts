// import { BaseEntity } from '@/common/entities/base.entity';
import { AgentApprovalMode, AgentMode } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Project } from '@/modules/projects/entities/project.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import type { ConversationMetadata } from '../shared/conversation-metadata';
import { AgentConversationTodo } from './agent-conversation-todo.entity';
import { AgentMessage } from './agent-message.entity';
import { AgentSubagent } from './agent-subagent.entity';

@Entity('agent_conversations')
@Index('IDX_agent_conv_workspaceId', ['workspaceId'])
@Index('IDX_agent_conv_createdBy', ['createdBy'])
@Index('IDX_agent_conv_projectId', ['projectId'])
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

  /**
   * The project the chat is about: its data tools only read and act inside
   * that project. Deleting the project deletes its chats too.
   */
  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  projectId?: string | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project?: Relation<Project> | null;

  @OneToMany(() => AgentMessage, (message) => message.conversation)
  messages: Relation<AgentMessage[]>;

  @OneToMany(() => AgentConversationTodo, (todo) => todo.conversation)
  todoItems: Relation<AgentConversationTodo[]>;

  @OneToMany(() => AgentSubagent, (subagent) => subagent.conversation)
  subagents: Relation<AgentSubagent[]>;

  @ApiProperty({ example: AgentMode.ASK })
  @IsEnum(AgentMode)
  @Column({ type: 'varchar', default: AgentMode.ASK })
  agentMode: AgentMode;

  @ApiProperty({ enum: AgentApprovalMode, example: AgentApprovalMode.MANUAL })
  @IsEnum(AgentApprovalMode)
  @Column({ type: 'varchar', default: AgentApprovalMode.MANUAL })
  approvalMode: AgentApprovalMode;

  @ApiProperty({
    description: 'Summarized context of previous conversation turns',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  summary?: string;

  @ApiProperty({
    description: 'Pinned worker for remote execution',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  workerId?: string;

  @ApiProperty({
    description:
      'Current model, context window usage and token/cost stats of the conversation',
    required: false,
    type: Object,
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  @Column({ type: 'jsonb', nullable: true })
  metadata?: ConversationMetadata | null;
}
