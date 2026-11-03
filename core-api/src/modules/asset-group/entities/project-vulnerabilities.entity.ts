import { BaseEntity } from '@/common/entities/base.entity';
import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
  Unique,
} from 'typeorm';
import { AssetGroup } from './asset-groups.entity';

/**
 * Which projects reported a vulnerability. A vulnerability row is shared by
 * the whole workspace (its fingerprint is name + asset + tool) while an asset
 * can sit in several projects, so the link lives here: one row per
 * (project, vulnerability), refreshed whenever a run of that project reports
 * it again.
 */
@Entity('project_vulnerabilities')
@Unique('UQ_pv_projectId_vulnerabilityId', ['projectId', 'vulnerabilityId'])
@Index('IDX_pv_projectId_lastSeenAt', ['projectId', 'lastSeenAt'])
@Index('IDX_pv_vulnerabilityId', ['vulnerabilityId'])
export class ProjectVulnerability extends BaseEntity {
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => AssetGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Relation<AssetGroup>;

  @Column({ type: 'uuid' })
  vulnerabilityId: string;

  @ManyToOne(() => Vulnerability, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vulnerabilityId' })
  vulnerability: Relation<Vulnerability>;

  // Run links are provenance only: deleting a run keeps the link and its
  // timestamps, it just loses the pointer (same rule as
  // `vulnerabilities.jobHistoryId`).
  @Column({ type: 'uuid', nullable: true })
  firstSeenJobHistoryId: string | null;

  @ManyToOne(() => JobHistory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'firstSeenJobHistoryId' })
  firstSeenJobHistory?: Relation<JobHistory> | null;

  @Column({ type: 'uuid', nullable: true })
  lastSeenJobHistoryId: string | null;

  @ManyToOne(() => JobHistory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'lastSeenJobHistoryId' })
  lastSeenJobHistory?: Relation<JobHistory> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  firstSeenAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  /** Distinct runs of this project that reported the vulnerability. */
  @Column({ type: 'int', default: 1 })
  timesSeen: number;
}
