import { MAX_JOB_CLAIM_SIZE, WORKER_CLAIM_CACHE_MS } from '@/common/constants/app.constants';
import { ArtifactSource, ArtifactStatus, JobStatus, WorkerScope, WorkerType } from '@/common/enums/enum';
import { NotFoundError } from '@/common/errors/domain.errors';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Artifact } from '../artifacts/entities/artifact.entity';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { StorageService } from '../storage/storage.service';
import { builtInTools } from '../tools/tools-provider/built-in-tools';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { GetNextJobResult, UpdateResultDto } from './dto/jobs-registry.dto';
import { Job } from './entities/job.entity';
import { JobsRegistryService } from './jobs-registry.service';

/** Long enough to outlast the worker's local wait for a container slot. */
const CUSTOM_TEMPLATE_URL_TTL_SECONDS = 3600;

/** What the nuclei connector downloads for one saved template. */
interface CustomTemplateRef {
  url: string;
  cacheKey: string;
}

/**
 * The worker side of the queue: claims the next pending jobs a worker may run
 * (one transaction, `MAX_JOB_CLAIM_SIZE` at most), signs their custom
 * templates, and shapes them into the payload the worker consumes. A job whose
 * templates are gone is failed through `JobsRegistryService.handleJobError`.
 */
@Injectable()
export class JobDispatchService {
  private readonly logger = new Logger(JobDispatchService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly connectorRegistry: ConnectorRegistryService,
    private readonly storageService: StorageService,
    private readonly jobsRegistry: JobsRegistryService,
  ) {}

  /**
   * Retrieves the next job associated with the given worker that has not yet
   * been started. If a job is found, it is updated with the worker's ID and
   * saved to the database. If no job is found, this function returns `null`.
   * @param workerId the ID of the worker to retrieve a job for
   * @returns the next job associated with the worker, or `null` if none is found
   */
  public async getNextJob(workerId: string): Promise<GetNextJobResult | null> {
    const jobs = await this.getNextJobs(workerId, 1);
    return jobs[0] ?? null;
  }

  /**
   * Claims up to `limit` eligible jobs for a worker in a single transaction.
   *
   * This is the batched form of `getNextJob`: a worker with N free concurrency
   * slots issues one claim instead of N, collapsing N round-trips and N
   * `FOR UPDATE` scans into one. The claim stays atomic per job — `SKIP LOCKED`
   * plus a conditional status update — so two workers racing on the same queue
   * never receive the same job.
   *
   * Jobs come back in dispatch order (priority desc, then oldest first). An
   * empty array means nothing is claimable right now, which callers must treat
   * exactly like a `null` from the single-job form.
   */
  public async getNextJobs(
    workerId: string,
    limit: number,
  ): Promise<GetNextJobResult[]> {
    // A worker controls how many slots it asks to fill, but never how much of
    // the queue one claim may drain.
    const claimSize = Math.max(
      1,
      Math.min(Math.floor(limit), MAX_JOB_CLAIM_SIZE),
    );

    // [OPT-2] Fetch worker OUTSIDE transaction to reduce lock hold time
    const worker = await this.dataSource.getRepository(WorkerInstance).findOne({
      where: { id: workerId },
      relations: ['workspace', 'tool'],
      cache: {
        id: `workers:${workerId}`,
        milliseconds: WORKER_CLAIM_CACHE_MS,
      },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found');
    }

    const isBuiltInTools = worker.type === WorkerType.BUILT_IN;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const queryBuilder = queryRunner.manager
        .createQueryBuilder(Job, 'jobs')
        .innerJoinAndSelect('jobs.asset', 'asset')
        .innerJoinAndSelect('asset.target', 'target')
        .leftJoinAndSelect('jobs.tool', 'tool')
        .where('jobs.status = :status', { status: JobStatus.PENDING })
        // [OPT-1] Use addOrderBy for compound sort (priority first, then createdAt)
        .orderBy('jobs.priority', 'DESC')
        .addOrderBy('jobs.createdAt', 'ASC');

      // [OPT-3] Only join workspace when actually needed
      if (isBuiltInTools && worker.scope !== WorkerScope.CLOUD) {
        queryBuilder.leftJoin('target.workspace', 'workspaces');
      }

      if (isBuiltInTools) {
        // Node-mode workers run Docker connectors (image-based jobs).
        // CLI/legacy workers may lack Docker, so connector (image) tools are
        // only eligible for node-mode workers.
        const allowedToolNames = builtInTools.map((tool) => tool.name);
        let connectorSlugs: string[] = [];
        if (worker.runMode === 'node') {
          // DB tool rows store the connector SLUG as `name` (e.g. 'nuclei'),
          // while the manifest display name is capitalized ('Nuclei'). The
          // `tool.name IN (:...names)` filter must use slugs or connector
          // jobs never match and stay PENDING forever.
          connectorSlugs = this.connectorRegistry
            .getAllConnectors()
            .map((c) => c.slug);
          allowedToolNames.push(...connectorSlugs);
        }
        queryBuilder.andWhere('tool.name IN (:...names)', {
          names: allowedToolNames,
        });

        // [OPT-6] Eligibility moved into the WHERE clause. It used to be a
        // post-query check that rolled the whole claim back, so one ineligible
        // job at the head of the queue starved every valid job behind it — and
        // with a batched claim that meant silently returning no work at all.
        // A job is runnable when it carries a command (built-in CLI tools) or
        // belongs to a connector (whose jobs have no command by design).
        if (connectorSlugs.length > 0) {
          queryBuilder.andWhere(
            `(jobs.command IS NOT NULL AND jobs.command <> '' OR tool.name IN (:...connectorSlugs))`,
            { connectorSlugs },
          );
        } else {
          queryBuilder.andWhere(
            `jobs.command IS NOT NULL AND jobs.command <> ''`,
          );
        }

        if (worker.scope !== WorkerScope.CLOUD) {
          queryBuilder.andWhere('workspaces.id = :workspaceId', {
            workspaceId: worker.workspace.id,
          });
        }
      } else {
        queryBuilder.andWhere('tool.id = :toolId', { toolId: worker.tool.id });
      }

      if (worker.internalNetworkId) {
        queryBuilder.andWhere('target.internalNetworkId = :internalNetworkId', {
          internalNetworkId: worker.internalNetworkId,
        });
      }

      // Every claimed job carries its own asset/service; the tool filter above
      // already scopes tool-bound workers.
      queryBuilder.leftJoinAndSelect('jobs.assetService', 'assetService');

      // [OPT-4] SKIP LOCKED avoids workers blocking each other on the same rows
      const jobs = await queryBuilder
        .setLock('pessimistic_write', undefined, ['jobs'])
        .limit(claimSize)
        .getMany();

      if (jobs.length === 0) {
        await queryRunner.rollbackTransaction();
        return [];
      }

      // [OPT-5] One UPDATE for the whole claim instead of one per job —
      // direct SQL, no per-row SELECT.
      await queryRunner.manager.update(
        Job,
        { id: In(jobs.map((job) => job.id)) },
        {
          workerId,
          status: JobStatus.IN_PROGRESS,
          pickJobAt: new Date(),
        },
      );

      await queryRunner.commitTransaction();

      const dispatchable = await this.attachCustomTemplates(jobs);
      return dispatchable.map((job) =>
        this.toGetNextJobResult(worker, isBuiltInTools, job),
      );
    } catch (error) {
      Logger.error(
        'Error in getNextJobs',
        error instanceof Error ? error : new Error(String(error)),
      );
      // attachCustomTemplates runs after commit; nothing left to roll back then
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      return [];
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Swaps each job's `customTemplateIds` for short-lived presigned URLs at
   * claim time, so no credential is ever stored on a job and a re-run gets
   * fresh ones. A job whose templates are gone is failed, not dispatched:
   * without them nuclei would run its whole baked collection instead.
   */
  private async attachCustomTemplates(jobs: Job[]): Promise<Job[]> {
    // Jobs of one run share a template set: resolve and sign it once.
    const signed = new Map<string, Promise<CustomTemplateRef[] | null>>();
    const dispatchable: Job[] = [];
    for (const job of jobs) {
      const ids = job.config?.customTemplateIds;
      if (!Array.isArray(ids) || ids.length === 0) {
        dispatchable.push(job);
        continue;
      }
      const workspaceId = job.asset.target?.workspaceId ?? '';
      const key = `${workspaceId}:${ids.join(',')}`;
      if (!signed.has(key)) {
        signed.set(key, this.signCustomTemplates(workspaceId, ids as string[]));
      }
      try {
        const templates = await signed.get(key);
        if (!templates) {
          throw new Error('A custom template of this run no longer exists');
        }
        const rest = { ...job.config };
        delete rest.customTemplateIds;
        job.config = { ...rest, customTemplates: templates };
        dispatchable.push(job);
      } catch (error) {
        try {
          await this.jobsRegistry.handleJobError(
            { jobId: job.id, data: {} as UpdateResultDto['data'] },
            job,
            error instanceof Error ? error : new Error(String(error)),
          );
        } catch (failError) {
          // Drop this job but keep dispatching the rest of the committed claim.
          this.logger.error(
            `Failed to mark job ${job.id} failed after custom template error`,
            failError instanceof Error ? failError.stack : String(failError),
          );
        }
      }
    }
    return dispatchable;
  }

  /** null when any id is not a ready template of the workspace. */
  private async signCustomTemplates(
    workspaceId: string,
    ids: string[],
  ): Promise<CustomTemplateRef[] | null> {
    const rows = await this.dataSource.getRepository(Artifact).find({
      where: {
        id: In(ids),
        workspaceId,
        source: ArtifactSource.TEMPLATE,
        status: ArtifactStatus.READY,
      },
      select: { id: true, bucket: true, objectKey: true, updatedAt: true },
    });
    if (rows.length !== new Set(ids).size) return null;
    const byId = new Map(rows.map((row) => [row.id, row]));
    return Promise.all(
      ids.map(async (id) => {
        const row = byId.get(id)!;
        const { url } = await this.storageService.getPresignedDownloadUrl({
          bucket: row.bucket,
          key: row.objectKey,
          expiresIn: CUSTOM_TEMPLATE_URL_TTL_SECONDS,
          absolute: true,
        });
        // Changes on every save, so connectors never serve a stale cached copy.
        return { url, cacheKey: `${row.id}-${row.updatedAt.getTime()}` };
      }),
    );
  }

  /**
   * Shapes a claimed Job row into the payload a worker consumes. Kept separate
   * from the claim so `getNextJobs` stays a pure query/claim concern.
   */
  private toGetNextJobResult(
    worker: WorkerInstance,
    isBuiltInTools: boolean,
    job: Job,
  ): GetNextJobResult {
    const base: GetNextJobResult = {
      id: job.id,
      category: job.category,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      priority: job.priority,
      command: job.command,
      asset: job.asset,
    };

    // Connector support: include tool metadata for non-built-in workers
    if (!isBuiltInTools && worker.tool) {
      base.tool = { id: worker.tool.id!, name: worker.tool.name };
      // Connector workers have no workspace — derive from job's target instead, fallback to worker workspace for backward compat
      base.workspaceId =
        job.asset.target?.workspaceId ??
        (worker.workspace as { id?: string })?.id;
      base.configProfileId = job.configProfileId;
      base.config = job.config;
      base.inputs = job.inputs;
    } else if (isBuiltInTools && job.tool) {
      // Connector job picked up by BUILT_IN worker
      base.tool = { id: job.tool.id!, name: job.tool.name };
      base.workspaceId = job.asset.target?.workspaceId;
      base.configProfileId = job.configProfileId;
      base.config = job.config;
      base.inputs = job.inputs;
    }

    return base;
  }
}
