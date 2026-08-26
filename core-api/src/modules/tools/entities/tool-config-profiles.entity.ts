import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { Tool } from './tools.entity';

@Entity('tool_config_profiles')
@Index('IDX_tcp_workspace_tool_name', ['workspace', 'tool', 'name'], {
  unique: true,
})
export class ToolConfigProfile extends BaseEntity {
  @ManyToOne(() => Tool, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toolId' })
  tool: Relation<Tool>;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: Record<string, unknown>;

  @Column({ default: false })
  isDefault: boolean;
}
