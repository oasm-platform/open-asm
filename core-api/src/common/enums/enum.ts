/**
 * Enum representing user roles in the system
 */
export enum Role {
  /** Administrator - has full permissions in the system */
  ADMIN = 'admin',
  /** Regular user */
  USER = 'user',
  /** Bot user */
  BOT = 'bot',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Enum representing who performed an audit event.
 * v1 only writes `user` (authenticated-session actions); the other values are
 * reserved for v2 (api_key attribution, worker/system events, agent actions).
 */
export enum AuditActorType {
  User = 'user',
  ApiKey = 'api_key',
  System = 'system',
  Agent = 'agent',
}

/**
 * Enum representing the outcome of an audited action.
 */
export enum AuditOutcome {
  Success = 'success',
  Failure = 'failure',
  Denied = 'denied',
}

/**
 * Enum representing tool categories used in the system
 */
export enum ToolCategory {
  SUBDOMAINS = 'subdomains',
  HTTP_PROBE = 'http_probe',
  PORTS_SCANNER = 'ports_scanner',
  VULNERABILITIES = 'vulnerabilities',
  SCREENSHOT = 'screenshot',
  URL_DISCOVERY = 'url_discovery',
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
  /** Skipped — tool was pending but a later tool in the pipeline has completed */
  SKIPPED = 'skipped',
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
  /** Worker from connector (container-based) */
  CONNECTOR = 'connector',
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
  DISABLED = 'disabled',
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
  WORKSPACE = 'workspace',
  MCP = 'mcp',
}

export enum BullMQName {
  ASSETS_DISCOVERY_SCHEDULE = 'assets-discovery-schedule',
  ASSET_GROUPS_WORKFLOW_SCHEDULE = 'asset-groups-workflow-schedule',
  JOB_RESULT = 'job-result',
  ISSUE_CREATION = 'issue-creation',
  VULNERABILITY_ANALYSIS = 'vulnerability-analysis',
  INTEGRATION_SYNC_SCHEDULE = 'integration-sync-schedule',
  REPOSITORY_SYNC = 'repository-sync',
  AUDIT_RETENTION = 'audit-retention',
}

export enum NotificationStatus {
  SENT = 'sent',
  UNREAD = 'unread',
  READ = 'read',
}

export enum NotificationScope {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  GROUP = 'GROUP',
}

export enum NotificationType {
  WORKSPACE_CREATED = 'WORKSPACE_CREATED',
  VULNERABILITY_ANALYSIS_COMPLETED = 'VULNERABILITY_ANALYSIS_COMPLETED',
  ASSET_NEW_DETECT = 'ASSET_NEW_DETECT',
  /** A scan ended without running its whole workflow (a step failed, or a step
   * that needed it was skipped). */
  SCAN_INCOMPLETE = 'SCAN_INCOMPLETE',
  NEW_VULNERABILITY_FOUND = 'NEW_VULNERABILITY_FOUND',
  WORKSPACE_INVITATION = 'WORKSPACE_INVITATION',
  /** A URL discovery run stored URLs no earlier run had. */
  NEW_URL_FOUND = 'NEW_URL_FOUND',
}

export enum Language {
  EN = 'en',
  VI = 'vi',
}

export enum IssueStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum IssueSourceType {
  VULNERABILITY = 'vulnerability',
}

export enum IssueCommentType {
  CONTENT = 'content',
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum DismissReason {
  FALSE_POSITIVE = 'false_positive',
  USED_IN_TEST = 'used_in_test',
  WONT_FIX = 'wont_fix',
}

export enum JobRunType {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
}

export enum VulnerabilityAnalyzeStatus {
  NOT_ANALYZED = 'not_analyzed',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
}

/**
 * Enum representing target scope - internal or external networks
 */
export enum TargetScopeType {
  /** Targets belonging to internal networks */
  INTERNAL = 'INTERNAL',
  /** Targets belonging to external networks (public) */
  EXTERNAL = 'EXTERNAL',
}

export enum AgentMode {
  ASK = 'ask',
  AGENT = 'agent',
}

export enum DefaultWorkflow {
  DOMAIN_DISCOVERY = 'domain_discovery.yaml',
  IP_ADDRESS_DISCOVERY = 'ip_address_discovery.yaml',
  VULNERABILITY_SCAN_BASIC = 'vulnerability_scan_basic.yaml',
  // Git organization targets: scans every repository after each sync.
  REPOSITORY_SCAN = 'repository_scan.yaml',
  // Started on demand from the Assets URLs tab.
  URL_DISCOVERY = 'url_discovery.yaml',
}

export enum EventTriggerType {
  WORKFLOW_START = 'WORKFLOW_START',
  WORKFLOW_END = 'WORKFLOW_END',
}

/**
 * Enum representing the type of target.
 * Lives here rather than in target.entity.ts so entities that sit on the
 * Target import cycle (Tool) can reference it at class-decoration time.
 */
export enum TargetType {
  DOMAIN = 'DOMAIN',
  CIDR = 'CIDR',
  IP = 'IP',
  /**
   * A GitHub organization/user or GitLab group bound to a SOURCE_CODE
   * integration. Its assets are the repositories, synced from the provider.
   */
  GIT_ORG = 'GIT_ORG',
}

/**
 * What an integration can do. Each value is a CAPABILITY backed by one
 * connector method (see `CAPABILITY_METHOD_MAP` in connector.factory.ts).
 *
 * Single-capability apps (Slack, Telegram, AWS, …) store their one value in
 * `integrations.category`. Multi-capability apps (GitHub, GitLab) declare
 * `x-capabilities` in their schema and store the enabled subset in
 * `integrations.capabilities`; `category` then holds the primary one.
 */
export enum IntegrationType {
  TICKETING = 'TICKETING',
  NOTIFICATION = 'NOTIFICATION',
  CLOUD_PROVIDER = 'CLOUD_PROVIDER',
  SOURCE_CODE = 'SOURCE_CODE',
}

/**
 * Event-bus consumer groups — one Redis consumer group per lane.
 *
 * An enum rather than four exported string constants: a group name is a Redis
 * key suffix that both the producer-side config and the consumer loop must
 * agree on, and a typo in a bare string only shows up as a lane that silently
 * never fires. Enum members make the compiler refuse it, and `Object.values`
 * gives an exhaustive list for the wiring tests without a second declaration
 * to keep in sync.
 *
 * An `email` member is deliberately absent: there is no mail transport behind
 * it, so the group would claim events it cannot deliver. Add it here and the
 * matching sink together, never one without the other.
 */
export enum EventBusGroup {
  /** Materializes the stream into `audit_events`; strictly ordered. */
  Audit = 'audit',
  /** Read models. */
  Projection = 'projection',
  /** In-app notification rows + SSE. */
  Notifications = 'notifications',
  /** Outbound webhooks, Slack, ticketing systems. */
  Integrations = 'integrations',
}

export enum TelegramConnectStatus {
  PENDING = 'PENDING',
  CONNECTED = 'CONNECTED',
}

/**
 * How commands run. Agent mode has every new plan approved by the user first,
 * in either mode.
 */
export enum AgentApprovalMode {
  /** Run every command without asking */
  AUTO = 'auto',
  /** Ask for every command that has not been approved before */
  MANUAL = 'manual',
}

export enum AgentCommandApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ArtifactSource {
  UPLOAD = 'upload',
  AGENT = 'agent',
}

export enum ArtifactShareType {
  PRIVATE = 'private',
  SHARED = 'shared',
  PUBLIC = 'public',
}

export enum ArtifactStatus {
  PENDING = 'pending',
  READY = 'ready',
  DELETED = 'deleted',
}

export enum ArtifactListScope {
  MINE = 'mine',
  SHARED = 'shared',
  ALL = 'all',
}
