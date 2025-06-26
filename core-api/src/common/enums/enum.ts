export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export enum WorkerName {
  SUBDOMAINS = 'subdomains',
  PORTS = 'ports',
  HTTPX = 'httpx',
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
