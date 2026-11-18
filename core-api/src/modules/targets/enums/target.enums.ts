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
 * Enum representing target scope - internal or external networks
 */
export enum TargetScopeType {
  /** Targets belonging to internal networks */
  INTERNAL = 'INTERNAL',
  /** Targets belonging to external networks (public) */
  EXTERNAL = 'EXTERNAL',
}
