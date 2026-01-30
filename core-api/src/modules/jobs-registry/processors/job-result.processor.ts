import { BullMQName, JobStatus, WorkerType } from '@/common/enums/enum';
import { JobDataResultType } from '@/common/types/app.types';
import { DataAdapterService } from '@/modules/data-adapter/data-adapter.service';
import { StorageService } from '@/modules/storage/storage.service';
import { builtInTools } from '@/modules/tools/tools-privider/built-in-tools';
import { RedisService } from '@/services/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadGatewayException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job as BullJob } from 'bullmq';
import { Repository } from 'typeorm';
import { DataPayloadResult } from '../dto/jobs-registry.dto';
import { Job } from '../entities/job.entity';
import { JobsRegistryService } from '../jobs-registry.service';

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
    bullJob: BullJob<{ workerId: string; jobId: string; resultRef: string }>,
  ): Promise<void> {
    const { workerId, jobId, resultRef } = bullJob.data;

    const job = await this.jobsRegistryService.findJobForUpdate(
      workerId,
      jobId,
    );
    if (!job) {
      this.logger.error(`Job not found: ${jobId} for worker: ${workerId}`);
      return;
    }

    // resultRef is in format "bucket/filename"
    const [bucket, ...rest] = resultRef.split('/');
    const fileName = rest.join('/');

    try {
      const data = await this.storageService.readJsonFile<DataPayloadResult>(
        fileName,
        bucket,
      );

      const isBuiltInTools = job.tool.type === WorkerType.BUILT_IN;

      let dataForSync: JobDataResultType;

      if (isBuiltInTools) {
        const builtInStep = builtInTools.find(
          (tool) => tool.name === job.tool.name,
        );

        if (!builtInStep) {
          throw new Error(`Worker step not found for worker: ${job.tool.name}`);
        }

        if (!data.raw && !builtInStep) {
          throw new BadGatewayException('Raw data is required');
        }
        dataForSync = builtInStep?.parser?.(data.raw ?? undefined);
      } else {
        dataForSync = data.payload;
      }

      if (job.isSaveData) {
        await this.dataAdapterService.syncData({
          data: dataForSync,
          job,
        });
      }
      if (data?.error) {
        throw new Error('Job reported error');
      }

      const completedJob = await this.jobRepo.save({
        ...job,
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      });

      // Decrement counter and check completion
      await this.jobsRegistryService.decrementAndCheckCompletion(
        job.jobHistory.id,
      );

      await this.jobsRegistryService.getNextStepForJob(completedJob);

      if (job.isPublishEvent) {
        await this.redis.publish(
          `jobs:${job.id}`,
          JSON.stringify(completedJob),
        );
      }

      // Success case: delete the result file
      try {
        this.storageService.deleteFile(fileName, bucket);
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
          this.storageService.deleteFile(fileName, bucket);
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
