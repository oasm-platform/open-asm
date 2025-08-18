import { Job } from '../jobs-registry/entities/job.entity';

export interface DataAdapterInput {
  data: any;
  job: Job;
}

// Common interface for sync data requests
export interface SyncDataRequest {
  category: string;
  data: DataAdapterInput;
}
