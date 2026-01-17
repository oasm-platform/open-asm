// Original file: proto/jobs_registry.proto

import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from '../google/protobuf/Timestamp';
import type { Struct as _google_protobuf_Struct, Struct__Output as _google_protobuf_Struct__Output } from '../google/protobuf/Struct';

export interface Asset {
  'id'?: (string);
  'created_at'?: (_google_protobuf_Timestamp | null);
  'updated_at'?: (_google_protobuf_Timestamp | null);
  'value'?: (string);
  'target_id'?: (string);
  'is_primary'?: (boolean);
  'dns_records'?: (_google_protobuf_Struct | null);
  'is_enabled'?: (boolean);
}

export interface Asset__Output {
  'id': (string);
  'created_at': (_google_protobuf_Timestamp__Output | null);
  'updated_at': (_google_protobuf_Timestamp__Output | null);
  'value': (string);
  'target_id': (string);
  'is_primary': (boolean);
  'dns_records': (_google_protobuf_Struct__Output | null);
  'is_enabled': (boolean);
}
