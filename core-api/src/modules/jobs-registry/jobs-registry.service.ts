import { Injectable } from '@nestjs/common';
import { WorkerName } from 'src/common/enums/enum';
import { Asset } from '../assets/entities/assets.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsRegistryService {
  constructor(@InjectRepository(Job) public readonly repo: Repository<Job>) {}
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
}
