import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

export interface MCPServerConfig {
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  allowed_tools?: string[] | null;
  timeout?: number;
}

export interface MCPConfigJson {
  mcpServers: Record<string, MCPServerConfig>;
}

@Entity('agent_mcp_configs')
@Index('IDX_agent_mcp_configs_workspaceId', ['workspaceId'], { unique: true })
export class AgentMCPConfig extends BaseEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'jsonb', default: () => `'{"mcpServers":{}}'` })
  configJson: MCPConfigJson;
}
