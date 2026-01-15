// Original file: proto/jobs_registry.proto

import type { UpdateResultDto as _jobs_registry_UpdateResultDto, UpdateResultDto__Output as _jobs_registry_UpdateResultDto__Output } from '../jobs_registry/UpdateResultDto';

export interface JobResultRequest {
  'worker_id'?: (string);
  'data'?: (_jobs_registry_UpdateResultDto | null);
}

export interface JobResultRequest__Output {
  'worker_id': (string);
  'data': (_jobs_registry_UpdateResultDto__Output | null);
}
