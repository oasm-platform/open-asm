import { BaseEntity } from '@/common/entities/base.entity';
import { ProjectAssetSource } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
} from 'typeorm';
import { Project } from './project.entity';
import { ProjectScopeRule } from './project-scope-rule.entity';

@Entity('project_assets')
@Index('IDX_pa_projectId', ['project'])
@Index('IDX_pa_assetId', ['asset'])
@Index('UQ_pa_projectId_assetId', ['projectId', 'assetId'], { unique: true })
export class ProjectAsset extends BaseEntity {
  @ManyToOne(() => Project, (project) => project.projectAssets, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Relation<Project>;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Asset, (asset) => asset.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assetId' })
  asset: Relation<Asset>;

  @Column({ type: 'uuid' })
  assetId: string;

  /** Picked by hand, or added because a scope rule matched. */
  @Column({ type: 'varchar', default: ProjectAssetSource.MANUAL })
  source: ProjectAssetSource;

  /**
   * The include rule that added the asset. Deleting the rule removes the
   * assets it added (the rule sync does that), so the FK only has to clear.
   */
  @Column({ type: 'uuid', nullable: true })
  scopeRuleId: string | null;

  @ManyToOne(() => ProjectScopeRule, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'scopeRuleId' })
  scopeRule?: Relation<ProjectScopeRule> | null;
}
