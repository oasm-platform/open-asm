import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from './bigint.transformer';

/**
 * Storage meter for a workspace. Created lazily on first reservation; only
 * `ArtifactQuotaService` writes it, with conditional atomic updates.
 */
@Entity('workspace_storage_usage')
@Check('CHK_wsu_used_nonneg', '"usedBytes" >= 0')
@Check('CHK_wsu_reserved_nonneg', '"reservedBytes" >= 0')
@Check('CHK_wsu_quota_nonneg', '"quotaBytes" IS NULL OR "quotaBytes" >= 0')
export class WorkspaceStorageUsage {
  @PrimaryColumn({ type: 'uuid' })
  workspaceId: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  /** Admin override; null means the `ARTIFACT_WORKSPACE_QUOTA_BYTES` default. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  quotaBytes: number | null;

  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  usedBytes: number;

  /** Bytes held by in-flight (`pending`) uploads. */
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  reservedBytes: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
