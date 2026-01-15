// Original file: proto/jobs_registry.proto


export interface Job {
  'id'?: (string);
  'asset'?: (string);
  'command'?: (string);
  '_command'?: "command";
}

export interface Job__Output {
  'id': (string);
  'asset': (string);
  'command'?: (string);
  '_command'?: "command";
}
