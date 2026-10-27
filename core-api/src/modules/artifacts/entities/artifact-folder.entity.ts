import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

/**
 * A folder in a workspace's Files tree; `parentFolderId` null means the root.
 * Deleting a non-empty folder is refused by the FKs (NO ACTION), so its files
 * must be purged through the service to release their quota.
 */
@Entity('artifact_folders')
@Index('IDX_artifact_folders_workspace_parent', ['workspaceId', 'parentFolderId'])
export class ArtifactFolder extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'uuid', nullable: true })
  parentFolderId: string | null;

  @ManyToOne(() => ArtifactFolder, { nullable: true })
  @JoinColumn({ name: 'parentFolderId' })
  parentFolder: Relation<ArtifactFolder> | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: Relation<User> | null;
}
