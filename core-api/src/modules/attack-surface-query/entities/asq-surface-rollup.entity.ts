import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';

export type AsqRollupMetric = 'port' | 'technology' | 'webserver' | 'statusCode' | 'tlsVersion';

/**
 * Pre-computed distribution counts of a workspace's attack surface, rebuilt
 * by `AsqRollupsService`. Read through the `rollups` resource, so dashboards
 * over very large workspaces do not scan the fact tables.
 */
@Entity('asq_surface_rollups')
@Unique('UQ_asq_surface_rollups_key', ['workspaceId', 'metric', 'key'])
@Index('IDX_asq_surface_rollups_workspace_value', ['workspaceId', 'value', 'id'])
export class AsqSurfaceRollup extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace?: Relation<Workspace>;

  @Column({ type: 'varchar', length: 32 })
  metric: AsqRollupMetric;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'integer' })
  value: number;

  @Column({ type: 'timestamptz' })
  computedAt: Date;
}
