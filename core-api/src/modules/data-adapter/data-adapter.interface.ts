import type { Job } from '../jobs-registry/entities/job.entity';

export interface DataAdapterInput<T> {
  data: T;
  job: Job;
}
