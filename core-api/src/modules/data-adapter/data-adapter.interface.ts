import type { Job } from '@/modules/jobs-registry/entities/job.entity';

export interface DataAdapterInput<T> {
  data: T;
  job: Job;
}
