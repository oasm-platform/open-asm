export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export enum ToolCategory {
  SUBDOMAINS = 'subdomains',
  HTTP_SCRAPER = 'http_scraper',
  PORTS_SCANNER = 'ports_scanner',
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

export enum CronSchedule {
  WEEKLY = '0 0 * * 0',
  BI_WEEKLY = '0 0 */14 * *',
  MONTHLY = '0 0 1 * *',
}
