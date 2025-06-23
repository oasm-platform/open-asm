import { Injectable } from '@nestjs/common';
import { JobStatus, WorkerName } from 'src/common/enums/enum';
import { Asset } from '../assets/entities/assets.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Job } from './entities/job.entity';
import { WorkersService } from '../workers/workers.service';
import { GetNextJobResponseDto } from './dto/jobs-registry.dto';

@Injectable()
export class JobsRegistryService {
  constructor(
    @InjectRepository(Job) public readonly repo: Repository<Job>,
    private workerService: WorkersService,
  ) {}
  public static workerSteps = [
    {
      id: WorkerName.SUBFINDER,
      description: 'Fast passive subdomain enumeration tool.',
      resultHandler: () => {},
    },
    {
      id: WorkerName.NAABU,
      description: 'Scan open ports and detect running services on each port.',
      resultHandler: () => {},
    },
    {
      id: WorkerName.DNSX,
      description:
        'Perform DNS resolution and enumeration to gather additional information about subdomains and their associated IP addresses.',
      resultHandler: () => {},
    },
  ];

  /**
   * Creates a new job associated with the given asset and worker name.
   * @param asset the asset the job is associated with
   * @param workerName the name of the worker to run on the asset
   * @returns the newly created job
   */
  public createJob(asset: Asset, workerName: WorkerName): Promise<Job> {
    return this.repo.save({
      asset,
      workerName,
    });
  }

  /**
   * Retrieves the next job associated with the given worker that has not yet
   * been started. If a job is found, it is updated with the worker's ID and
   * saved to the database. If no job is found, this function returns `null`.
   * @param workerId the ID of the worker to retrieve a job for
   * @returns the next job associated with the worker, or `null` if none is found
   */
  public async getNextJob(
    workerId: string,
  ): Promise<GetNextJobResponseDto | null> {
    const worker = await this.workerService.getWorkerById(workerId);
    console.log(worker);
    const job = await this.repo.findOne({
      where: {
        status: JobStatus.PENDING,
        workerName: worker?.workerName,
      },
      order: {
        createdAt: 'ASC',
      },
      relations: ['asset'],
    });

    if (job) {
      job.workerId = workerId;
      job.status = JobStatus.IN_PROGRESS;
      await this.repo.save(job);

      return {
        jobId: job.id,
        value: job.asset.value,
        workerName: job.workerName,
      };
    }

    return null;
  }
}
