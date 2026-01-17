// Original file: proto/jobs_registry.proto

import type { AssetList as _jobs_registry_AssetList, AssetList__Output as _jobs_registry_AssetList__Output } from '../jobs_registry/AssetList';
import type { HttpResponse as _jobs_registry_HttpResponse, HttpResponse__Output as _jobs_registry_HttpResponse__Output } from '../jobs_registry/HttpResponse';
import type { NumberList as _jobs_registry_NumberList, NumberList__Output as _jobs_registry_NumberList__Output } from '../jobs_registry/NumberList';
import type { VulnerabilityList as _jobs_registry_VulnerabilityList, VulnerabilityList__Output as _jobs_registry_VulnerabilityList__Output } from '../jobs_registry/VulnerabilityList';
import type { AssetTagList as _jobs_registry_AssetTagList, AssetTagList__Output as _jobs_registry_AssetTagList__Output } from '../jobs_registry/AssetTagList';

export interface DataPayloadResult {
  'error'?: (boolean);
  'raw'?: (string);
  'assets'?: (_jobs_registry_AssetList | null);
  'http_response'?: (_jobs_registry_HttpResponse | null);
  'numbers'?: (_jobs_registry_NumberList | null);
  'vulnerabilities'?: (_jobs_registry_VulnerabilityList | null);
  'asset_tags'?: (_jobs_registry_AssetTagList | null);
  '_raw'?: "raw";
  'payload'?: "assets"|"http_response"|"numbers"|"vulnerabilities"|"asset_tags";
}

export interface DataPayloadResult__Output {
  'error': (boolean);
  'raw'?: (string);
  'assets'?: (_jobs_registry_AssetList__Output | null);
  'http_response'?: (_jobs_registry_HttpResponse__Output | null);
  'numbers'?: (_jobs_registry_NumberList__Output | null);
  'vulnerabilities'?: (_jobs_registry_VulnerabilityList__Output | null);
  'asset_tags'?: (_jobs_registry_AssetTagList__Output | null);
  '_raw'?: "raw";
  'payload'?: "assets"|"http_response"|"numbers"|"vulnerabilities"|"asset_tags";
}
