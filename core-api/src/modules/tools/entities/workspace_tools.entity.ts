import { BaseEntity } from 'src/common/entities/base.entity';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Tool } from './tools.entity';

@Entity('workspace_tools')
export class WorkspaceTool extends BaseEntity {
  @ManyToOne(() => Tool, (tool) => tool.workspaceTools)
  @JoinColumn({ name: 'toolId' })
  tool: Tool;

  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceTools)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ default: true })
  isEnabled: boolean;
}
