import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Entity, Index, ManyToOne, Unique } from 'typeorm';
import { Target } from './target.entity';

@Entity('workspace_targets')
@Unique(['workspace', 'target'])
@Index('IDX_wt_targetId', ['target'])
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
