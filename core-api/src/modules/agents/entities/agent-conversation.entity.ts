import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AgentMessage } from './agent-message.entity';

@Entity('agent_conversations')
export class AgentConversation extends BaseEntity {
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
}
