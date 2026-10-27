import { BaseEntity } from '@/common/entities/base.entity';
import {
  ArtifactShareType,
  ArtifactSource,
  ArtifactStatus,
} from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Relation,
  Unique,
} from 'typeorm';
import { ArtifactFolder } from './artifact-folder.entity';
import { ArtifactShare } from './artifact-share.entity';
import { bigintTransformer } from './bigint.transformer';

/** A file stored in the `artifacts` bucket, owned by a workspace. */
@Entity('artifacts')
@Unique('UQ_artifacts_bucket_objectKey', ['bucket', 'objectKey'])
@Index('IDX_artifacts_workspace_created', ['workspaceId', 'createdAt'])
@Index('IDX_artifacts_creator', ['createdByUserId'])
@Index('IDX_artifacts_workspace_folder', ['workspaceId', 'parentFolderId'])
@Index('IDX_artifacts_status_expires', ['status', 'expiresAt'])
export class Artifact extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  /** Containing folder; null means the workspace root. */
  @Column({ type: 'uuid', nullable: true })
  parentFolderId: string | null;

  @ManyToOne(() => ArtifactFolder, { nullable: true })
  @JoinColumn({ name: 'parentFolderId' })
  parentFolder: Relation<ArtifactFolder> | null;

  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: Relation<User> | null;

  @Column({ type: 'varchar', default: ArtifactSource.UPLOAD })
  source: ArtifactSource;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'varchar', default: 'artifacts' })
  bucket: string;

  @Column({ type: 'text' })
  objectKey: string;

  @Column({ type: 'varchar' })
  mimeType: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  sizeBytes: number;

  @Column({ type: 'varchar', default: ArtifactShareType.PRIVATE })
  shareType: ArtifactShareType;

  @Column({ type: 'varchar', default: ArtifactStatus.PENDING })
  status: ArtifactStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  /** Upload deadline while `pending`; the sweep purges it afterwards. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @OneToMany(() => ArtifactShare, (share) => share.artifact)
  shares: Relation<ArtifactShare[]>;
}
