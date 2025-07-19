export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export enum WorkerName {
  SUBDOMAINS = 'subdomains',
  HTTPX = 'httpx',
  PORTS = 'ports',
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ScanStatus {
  RUNNING = 'RUNNING',
  DONE = 'DONE',
}

export enum WorkerType {
  BUILT_IN = 'built_in',
  PLUGIN = 'plugin',
}
