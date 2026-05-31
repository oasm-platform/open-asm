import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Tool } from './tools.entity';

@Entity('workspace_tools')
@Index('IDX_wt_toolId_workspaceId', ['tool', 'workspace'])
@Index('IDX_wt_workspaceId', ['workspace'])
export class WorkspaceTool extends BaseEntity {
  @ManyToOne(() => Tool, (tool) => tool.workspaceTools)
  @JoinColumn({ name: 'toolId' })
  tool: Tool;

  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceTools, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ default: true })
  isEnabled: boolean;
}
