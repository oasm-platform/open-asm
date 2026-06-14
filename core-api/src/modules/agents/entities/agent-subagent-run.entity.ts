import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type {
  SubAgentRunStatus,
  SubAgentType,
} from '../subagents/subagent.types';
import { AgentConversation } from './agent-conversation.entity';
import { AgentMessage } from './agent-message.entity';

@Entity('agent_subagent_runs')
@Index('IDX_agent_sub_run_conversationId', ['conversationId'])
@Index('IDX_agent_sub_run_messageId', ['messageId'])
@Index('IDX_agent_sub_run_status', ['status'])
export class AgentSubagentRun extends BaseEntity {
  @ApiProperty({ description: 'Conversation this run belongs to' })
  @IsUUID()
  @Column({ type: 'uuid' })
  conversationId: string;

  @ApiPropertyOptional({ description: 'Message that triggered this run' })
  @IsOptional()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  messageId?: string;

  @ApiProperty({ example: 'recon', description: 'Subagent type executed' })
  @IsString()
  @Column({ type: 'varchar', length: 50 })
  agentType: SubAgentType;

  @ApiProperty({ example: 'Recon Agent', description: 'Display name of the subagent' })
  @IsString()
  @Column({ type: 'varchar', length: 255 })
  agentName: string;

  @ApiProperty({
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  })
  @IsEnum(['pending', 'running', 'completed', 'failed', 'cancelled'] as const)
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SubAgentRunStatus;

  @ApiProperty({ description: 'Description of the task given to this subagent' })
  @IsString()
  @Column({ type: 'text' })
  taskDescription: string;

  @ApiPropertyOptional({ description: 'Short text summary of the result on success' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  resultSummary?: string;

  @ApiPropertyOptional({ description: 'Error message when status is failed' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @ApiProperty({ default: 0, description: 'Input (prompt) tokens consumed' })
  @IsInt()
  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @ApiProperty({ default: 0, description: 'Output (completion) tokens produced' })
  @IsInt()
  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @ApiProperty({ default: 0, description: 'Total tokens (input + output)' })
  @IsInt()
  @Column({ type: 'int', default: 0 })
  totalTokens: number;

  @ApiPropertyOptional({ description: 'Timestamp when the subagent started executing' })
  @IsOptional()
  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'Timestamp when the subagent finished' })
  @IsOptional()
  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ApiPropertyOptional({ description: 'Wall-clock duration in milliseconds' })
  @IsOptional()
  @IsInt()
  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @ApiPropertyOptional({ description: 'Model identifier used for this run' })
  @IsOptional()
  @IsString()
  @Column({ type: 'varchar', length: 255, nullable: true })
  modelUsed?: string;

  @ApiProperty({ default: 0, description: 'Number of tool-call steps executed' })
  @IsInt()
  @Column({ type: 'int', default: 0 })
  stepsExecuted: number;

  @ApiProperty({ type: [String], description: 'Names of tools invoked during this run' })
  @Column({ type: 'text', array: true, default: '{}' })
  toolsUsed: string[];

  @ApiProperty({ default: 1, description: 'Optimistic-lock version for concurrent updates' })
  @IsInt()
  @Column({ type: 'int', default: 1 })
  version: number;

  // --- Relations ---

  @ManyToOne(() => AgentConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: AgentConversation;

  @ManyToOne(() => AgentMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'messageId' })
  message?: AgentMessage;
}
