import { BaseEntity } from '@/common/entities/base.entity';
import { AgentCommandApprovalStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

@Entity('agent_command_approvals')
@Index('IDX_agent_cmd_approval_user_hash', ['userId', 'hash'], { unique: true })
@Index('IDX_agent_cmd_approval_workspace', ['workspaceId'])
export class AgentCommandApproval extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  userId: string;

  @ApiProperty()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true })
  conversationId?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', length: 255, nullable: true })
  toolCallId?: string | null;

  @ApiProperty()
  @Column({ type: 'text' })
  command: string;

  @ApiProperty({ description: 'SHA-256 of the normalized command' })
  @Column({ type: 'varchar', length: 64 })
  hash: string;

  @ApiProperty({ enum: AgentCommandApprovalStatus })
  @Column({ type: 'varchar', default: AgentCommandApprovalStatus.PENDING })
  status: AgentCommandApprovalStatus;
}
