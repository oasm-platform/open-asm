import type { Job } from '../jobs-registry/entities/job.entity';

export interface DataAdapterInput<T> {
  data: T;
  job: Job;
}

// Common interface for sync data requests
export interface SyncDataRequest {
  category: string;
  data: DataAdapterInput<any>;
}
