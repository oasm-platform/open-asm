import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Entity, ManyToOne, Unique } from 'typeorm';
import { Target } from './target.entity';

@Entity('workspace_targets')
@Unique(['workspace', 'target'])
export class WorkspaceTarget extends BaseEntity {
  @ManyToOne(() => Workspace, (workspace) => workspace.workspaceTargets, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @ManyToOne(() => Target, (target) => target.workspaceTargets, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  target: Target;
}
