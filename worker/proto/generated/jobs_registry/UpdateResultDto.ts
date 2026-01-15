// Original file: proto/jobs_registry.proto

import type { DataPayloadResult as _jobs_registry_DataPayloadResult, DataPayloadResult__Output as _jobs_registry_DataPayloadResult__Output } from '../jobs_registry/DataPayloadResult';

export interface UpdateResultDto {
  'job_id'?: (string);
  'data'?: (_jobs_registry_DataPayloadResult | null);
}

export interface UpdateResultDto__Output {
  'job_id': (string);
  'data': (_jobs_registry_DataPayloadResult__Output | null);
}
