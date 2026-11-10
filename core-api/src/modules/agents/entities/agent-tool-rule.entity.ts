import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AgentToolRuleAction } from '../enums/agent.enums';

/**
 * A workspace-wide allow/deny/ask rule on agent tool calls, checked before
 * the approval flow (see agents.guard.ts).
 */
@Entity('agent_tool_rules')
@Index(['workspaceId', 'enabled'])
export class AgentToolRule extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator?: Relation<User>;

  @ApiProperty({ example: 'execute_remote_command', description: 'Tool name; `*` matches any run of characters' })
  @Column({ type: 'varchar', length: 255 })
  toolName: string;

  @ApiPropertyOptional({ nullable: true, description: 'Matched against the command, or the JSON input of other tools; null matches every call' })
  @Column({ type: 'text', nullable: true })
  pattern: string | null;

  @ApiProperty({ default: false, description: 'pattern is a case-insensitive regex instead of a case-insensitive substring' })
  @Column({ type: 'boolean', default: false })
  isRegex: boolean;

  @ApiProperty({ enum: AgentToolRuleAction, enumName: 'AgentToolRuleAction' })
  @Column({ type: 'varchar' })
  action: AgentToolRuleAction;

  @ApiProperty({ default: 0, description: 'Higher runs first; on a tie deny beats ask beats allow' })
  @Column({ type: 'int', default: 0 })
  priority: number;

  @ApiProperty({ default: true })
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
