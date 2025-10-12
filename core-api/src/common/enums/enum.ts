/**
 * Enum representing user roles in the system
 */
export enum Role {
  /** Administrator - has full permissions in the system */
  ADMIN = 'admin',
  /** Regular user */
  USER = 'user',
}

/**
 * Enum representing tool categories used in the system
 */
export enum ToolCategory {
  /** Subdomain discovery tool */
  SUBDOMAINS = 'subdomains',
  /** HTTP probe checking tool */
  HTTP_PROBE = 'http_probe',
  /** Port scanning tool */
  PORTS_SCANNER = 'ports_scanner',
  /** Vulnerability detection tool */
  VULNERABILITIES = 'vulnerabilities',
  /** Data classification tool */
  CLASSIFIER = 'classifier',
}

/**
 * Enum representing job statuses
 */
export enum JobStatus {
  /** Waiting to be executed */
  PENDING = 'pending',
  /** Currently being executed */
  IN_PROGRESS = 'in_progress',
  /** Successfully completed */
  COMPLETED = 'completed',
  /** Failed */
  FAILED = 'failed',
  /** Cancelled */
  CANCELLED = 'cancelled',
}

/**
 * Enum representing scan statuses
 */
export enum ScanStatus {
  /** Running */
  RUNNING = 'RUNNING',
  /** Completed */
  DONE = 'DONE',
}

/**
 * Enum representing worker types
 */
export enum WorkerType {
  /** Built-in worker in the system */
  BUILT_IN = 'built_in',
  /** Worker from external provider */
  PROVIDER = 'provider',
}

/**
 * Enum representing worker scopes
 */
export enum WorkerScope {
  /** Worker operates at the system-wide level (cloud) */
  CLOUD = 'cloud',
  /** Worker operates within a specific workspace */
  WORKSPACE = 'workspace',
}

/**
 * Enum representing cron job schedules
 */
export enum CronSchedule {
  /** Runs daily at 00:00 */
  DAILY = '0 0 * * *',
  /** Runs every 3 days at 00:00 */
  EVERY_3_DAYS = '0 0 */3 * *',
  /** Runs weekly on Sunday at 00:00 */
  WEEKLY = '0 0 * * 0',
  /** Runs bi-weekly on the 1st and 15th of each month at 00:00 */
  BI_WEEKLY = '0 0 */14 * *',
  /** Runs monthly on the 1st at 00:00 */
  MONTHLY = '0 0 1 * *',
}

/**
 * Enum representing severity levels of issues or security vulnerabilities
 */
export enum Severity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Enum representing job priorities
 * Lower numeric values indicate higher priority
 */
export enum JobPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  BACKGROUND = 4,
}

/**
 * Enum representing API key types
 */
export enum ApiKeyType {
  TOOL = 'tool',
  WORKSPACE = 'workspace',
  MCP = 'mcp',
}

export enum BullMQName {
  SCAN_SCHEDULE = 'scan-schedule',
}
