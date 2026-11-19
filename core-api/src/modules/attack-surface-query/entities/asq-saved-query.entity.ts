import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';

/**
 * A named attack surface query batch of a workspace, reused by the
 * playground, the API and query reports. `spec` is a `QueryBatchInput` and is
 * validated again on every run (the catalog or the caller may have changed).
 */
@Entity('asq_saved_queries')
@Unique('UQ_asq_saved_queries_workspace_name', ['workspaceId', 'name'])
@Index('IDX_asq_saved_queries_workspaceId', ['workspaceId'])
export class AsqSavedQuery extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace?: Relation<Workspace>;

  @ApiProperty()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ type: Object, additionalProperties: true })
  @Column({ type: 'jsonb' })
  spec: Record<string, unknown>;

  @ApiProperty({ required: false, nullable: true, type: String })
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator?: Relation<User>;
}
