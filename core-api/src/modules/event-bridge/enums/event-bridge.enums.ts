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
  /** Project scope rules and the "assets added" trigger. */
  Projects = 'projects',
  /** Issue rules and the automation of issue types (auto-resolve, reopen). */
  Issues = 'issues',
}
