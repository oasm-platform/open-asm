// Original file: proto/jobs_registry.proto

import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from '../google/protobuf/Timestamp';
import type { Struct as _google_protobuf_Struct, Struct__Output as _google_protobuf_Struct__Output } from '../google/protobuf/Struct';

export interface HttpResponse {
  'id'?: (string);
  'created_at'?: (_google_protobuf_Timestamp | null);
  'timestamp'?: (_google_protobuf_Timestamp | null);
  'tls'?: (_google_protobuf_Struct | null);
  'port'?: (string);
  'url'?: (string);
  'input'?: (string);
  'title'?: (string);
  'scheme'?: (string);
  'webserver'?: (string);
  'body'?: (string);
  'content_type'?: (string);
  'method'?: (string);
  'host'?: (string);
  'path'?: (string);
  'favicon'?: (string);
  'favicon_md5'?: (string);
  'favicon_url'?: (string);
  'header'?: (_google_protobuf_Struct | null);
  'raw_header'?: (string);
  'request'?: (string);
  'time'?: (string);
  'a'?: (string)[];
  'tech'?: (string)[];
  'words'?: (number);
  'lines'?: (number);
  'status_code'?: (number);
  'content_length'?: (number);
  'failed'?: (boolean);
  'knowledgebase'?: (_google_protobuf_Struct | null);
  'resolvers'?: (string)[];
  'chain_status_codes'?: (string)[];
  'asset_service_id'?: (string);
  'job_history_id'?: (string);
}

export interface HttpResponse__Output {
  'id': (string);
  'created_at': (_google_protobuf_Timestamp__Output | null);
  'timestamp': (_google_protobuf_Timestamp__Output | null);
  'tls': (_google_protobuf_Struct__Output | null);
  'port': (string);
  'url': (string);
  'input': (string);
  'title': (string);
  'scheme': (string);
  'webserver': (string);
  'body': (string);
  'content_type': (string);
  'method': (string);
  'host': (string);
  'path': (string);
  'favicon': (string);
  'favicon_md5': (string);
  'favicon_url': (string);
  'header': (_google_protobuf_Struct__Output | null);
  'raw_header': (string);
  'request': (string);
  'time': (string);
  'a': (string)[];
  'tech': (string)[];
  'words': (number);
  'lines': (number);
  'status_code': (number);
  'content_length': (number);
  'failed': (boolean);
  'knowledgebase': (_google_protobuf_Struct__Output | null);
  'resolvers': (string)[];
  'chain_status_codes': (string)[];
  'asset_service_id': (string);
  'job_history_id': (string);
}
