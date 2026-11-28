/** How a logged agent HTTP request ended (stored as smallint). */
export enum AgentHttpOutcome {
  ALLOWED = 0,
  /** The egress proxy refused it (bad proxy credentials). */
  DENIED = 1,
  UPSTREAM_ERROR = 2,
  CANCELLED = 3,
}
