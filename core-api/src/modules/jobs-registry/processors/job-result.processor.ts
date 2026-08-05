import { BullMQName, JobStatus, WorkerType } from '@/common/enums/enum';
import { JobDataResultType } from '@/common/types/app.types';
import { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import { StorageService } from '@/modules/storage/storage.service';
import { builtInTools } from '@/modules/tools/tools-provider/built-in-tools';
import { RedisService } from '@/services/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadGatewayException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bullmq';
import { Repository } from 'typeorm';
import { DataPayloadResult } from '../dto/jobs-registry.dto';
import { Job } from '../entities/job.entity';
import { JobsRegistryService } from '../jobs-registry.service';

/** Shape of result JSON stored on S3 by the new category-specific endpoint. */
interface CategoryResultData {
  jobId?: string;
  error?: boolean;
  raw?: string | null;
  payload?: unknown;
}

@Processor(BullMQName.JOB_RESULT, {
  concurrency: 10,
})
export class JobResultProcessor extends WorkerHost {
  private readonly logger = new Logger(JobResultProcessor.name);

  constructor(
    private readonly jobsRegistryService: JobsRegistryService,
    private readonly dataAdapterService: DataAdapterService,
    private readonly redis: RedisService,
    private readonly storageService: StorageService,
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {
    super();
  }

  async process(
    bullJob: BullJob<{
      workerId: string;
      jobId: string;
      resultRef: string;
      category?: string;
    }>,
  ): Promise<void> {
    const { workerId, jobId, resultRef, category } = bullJob.data;

    // resultRef is in format "bucket/filename"
    const [bucket, ...rest] = resultRef.split('/');
    const fileName = rest.join('/');

    const job = await this.jobsRegistryService.findJobForUpdate(
      workerId,
      jobId,
    );
    if (!job) {
      // The job row is gone (e.g. workflow deleted or job created on another
      // instance). Nothing can be processed — delete the staged result file so
      // it does not accumulate in storage as an orphan.
      this.logger.error(`Job not found: ${jobId} for worker: ${workerId}`);
      try {
        await this.storageService.deleteFile(fileName, bucket);
      } catch (error) {
        this.logger.error(
          `Failed to delete orphaned result file ${resultRef}:`,
          error,
        );
      }
      return;
    }

    try {
      // Read result JSON. The new split-result endpoint stores the full DTO
      // (e.g. SubdomainResultDto → {jobId, error, raw, payload}) while the
      // deprecated endpoint stores only DataPayloadResult ({error, raw, payload}).
      // Both have error/raw/payload at root — parse them in a format-agnostic way.
      const rawResult =
        await this.storageService.readJsonFile<CategoryResultData>(
          fileName,
          bucket,
        );

      // Check error flag BEFORE syncing data — avoid wasting work on failed jobs
      if (rawResult?.error) {
        throw new Error('Job reported error');
      }

      const raw = rawResult.raw ?? undefined;
      const payload = rawResult.payload;
      const isBuiltInTools = job.tool.type === WorkerType.BUILT_IN;

      let dataForSync: JobDataResultType;

      if (isBuiltInTools) {
        const builtInStep = builtInTools.find(
          (tool) => tool.name === job.tool.name,
        );

        if (!builtInStep) {
          throw new Error(`Built-in step not found for tool: ${job.tool.name}`);
        }

        if (!raw) {
          throw new BadGatewayException(
            `Raw CLI output is required for built-in tool: ${job.tool.name}`,
          );
        }

        if (!builtInStep.parser) {
          throw new Error(
            `Parser function not found for built-in tool: ${job.tool.name}`,
          );
        }

        dataForSync = builtInStep.parser(raw);
      } else {
        // External/custom tool — use the structured payload directly.
        // For the new category-specific endpoint the category is available
        // in the BullMQ data; fall back to job.tool.category for old endpoint.
        dataForSync = (payload ?? undefined) as JobDataResultType;

        if (!dataForSync) {
          this.logger.warn(
            `No structured payload for external tool ${job.tool.name} ` +
              `(category: ${category ?? job.tool.category}). Skipping data sync.`,
          );
        }
      }

      if (job.isSaveData && dataForSync !== undefined) {
        await this.dataAdapterService.syncData({
          data: dataForSync,
          job,
        });
      }

      const completedJob = await this.jobRepo.save({
        ...job,
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      });

      const nextStepJobCount =
        await this.jobsRegistryService.getNextStepForJob(completedJob);

      if (nextStepJobCount === 0) {
        await this.jobsRegistryService.markWorkflowDone(job.jobHistory.id);
      }

      if (job.isPublishEvent) {
        await this.redis.publish(
          `jobs:${job.id}`,
          JSON.stringify(completedJob),
        );
      }

      // Success case: delete the result file
      try {
        await this.storageService.deleteFile(fileName, bucket);
      } catch (error) {
        this.logger.error(
          `Failed to delete result file on success ${resultRef}:`,
          error,
        );
      }
    } catch (e) {
      const isLastAttempt =
        bullJob.attemptsMade + 1 >= (bullJob.opts.attempts || 1);

      if (isLastAttempt) {
        await this.jobsRegistryService.handleJobError(
          { jobId, data: {} as DataPayloadResult },
          job,
          e,
        );

        // Final failure: delete the result file
        try {
          await this.storageService.deleteFile(fileName, bucket);
        } catch (error) {
          this.logger.error(
            `Failed to delete result file on final failure ${resultRef}:`,
            error,
          );
        }
      }

      // Throw error to let BullMQ handle retry logic
      throw e;
    }
  }
}
