import { BaseEntity } from '@/common/entities/base.entity';
import { JobRunType } from '@/common/enums/enum';
import { HttpResponse } from '@/modules/assets/entities/http-response.entity';
import { DiscoveredUrl } from '@/modules/assets/entities/discovered-url.entity';
import { Port } from '@/modules/assets/entities/ports.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { Workflow } from '@/modules/workflows/entities/workflow.entity';
import type {
  WorkflowRunScope,
  WorkflowRunStepStates,
} from '@/modules/workflows/workflow-graph';
import { Column, Entity, Index, ManyToOne, OneToMany, Relation } from 'typeorm';
import { Job } from './job.entity';

@Entity('job_histories')
@Index('IDX_job_histories_workflow', ['workflow'])
export class JobHistory extends BaseEntity {
  @OneToMany(() => Job, (job) => job.jobHistory, {
    onDelete: 'CASCADE',
  })
  jobs?: Relation<Job[]>;

  @OneToMany(() => Port, (port) => port.jobHistory, {
    onDelete: 'CASCADE',
  })
  ports?: Relation<Port[]>;

  // Vulnerabilities are anchored to the tool that found them (and the asset),
  // not to the run that produced them. Deleting a job history (which cascades
  // from a workflow/asset-group delete) must not delete findings, so the FK
  // drops the provenance link instead of the row.
  @OneToMany(() => Vulnerability, (vulnerability) => vulnerability.jobHistory, {
    onDelete: 'SET NULL',
  })
  vulnerabilities?: Relation<Vulnerability[]>;

  @OneToMany(() => HttpResponse, (httpResponse) => httpResponse.jobHistory, {
    onDelete: 'CASCADE',
  })
  httpResponses?: Relation<HttpResponse[]>;

  @OneToMany(() => DiscoveredUrl, (u) => u.jobHistory, {
    onDelete: 'CASCADE',
  })
  discoveredUrls?: Relation<DiscoveredUrl[]>;

  /**
   * @deprecated Counter-based completion tracking is deprecated.
   * Workflow completion is now determined by whether the last job spawns any new jobs.
   * This column is kept for backward compatibility and will be removed in a future migration.
   */
  @Column({ default: 0 })
  pendingJobsCount: number;

  @Column({ default: false })
  isCompleted: boolean;

  /**
   * Per-run state of the workflow DAG, keyed by job id (the key in
   * `workflow.content.jobs`): whether the job was dispatched, how many
   * job rows it fanned out to, and whether it finished, failed or was skipped
   * (with the reason). Written by `WorkflowRunnerService` under a row lock —
   * this is the engine's source of truth for "what else should run".
   */
  @Column({ type: 'jsonb', default: {} })
  steps: WorkflowRunStepStates;

  /**
   * Scan scope captured when the run started (`targetIds` for an event-triggered
   * run, `assetIds` for an asset-group run). Steps dispatched later in the chain
   * reuse it, so a group run never drifts to a target-wide fan-out.
   */
  @Column({ type: 'jsonb', nullable: true })
  scope?: WorkflowRunScope | null;

  @ManyToOne(() => Workflow, (workflow) => workflow.jobHistories, {
    onDelete: 'CASCADE',
  })
  workflow: Relation<Workflow>;

  @Column({ nullable: true })
  jobHistoryName?: string;

  @Column({
    type: 'varchar',
    default: JobRunType.MANUAL,
  })
  jobRunType: JobRunType;
}
