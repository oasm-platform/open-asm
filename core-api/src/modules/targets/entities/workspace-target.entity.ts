import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Target } from './target.entity';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';

@Entity('workspace_targets')
export class WorkspaceTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
