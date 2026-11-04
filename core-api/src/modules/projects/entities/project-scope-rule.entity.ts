import { BaseEntity } from '@/common/entities/base.entity';
import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { Project } from './project.entity';

/**
 * One line of a project's scope: include or exclude the assets of a target,
 * the hostnames matching a wildcard, the addresses inside a CIDR, or a single
 * asset. Include rules add assets with `source = rule`; exclude rules keep
 * matching assets out of the rule-added set (hand-picked assets are never
 * removed by a rule).
 */
@Entity('project_scope_rules')
@Index('IDX_psr_projectId', ['projectId'])
export class ProjectScopeRule extends BaseEntity {
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.scopeRules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Relation<Project>;

  @ApiProperty({ enum: ProjectScopeRuleMode, enumName: 'ProjectScopeRuleMode' })
  @Column({ type: 'varchar' })
  mode: ProjectScopeRuleMode;

  @ApiProperty({ enum: ProjectScopeRuleType, enumName: 'ProjectScopeRuleType' })
  @Column({ type: 'varchar' })
  type: ProjectScopeRuleType;

  /** Target id, hostname pattern, CIDR or asset id, depending on `type`. */
  @ApiProperty()
  @Column({ type: 'varchar' })
  value: string;
}
