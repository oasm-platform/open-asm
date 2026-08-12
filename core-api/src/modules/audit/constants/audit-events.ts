/**
 * v1 audit event dictionary (plan §4, rows 1–35 renumbered).
 *
 * SINGLE SOURCE OF TRUTH: every action is declared exactly once, as an
 * entry in `AUDIT_ACTION_CATALOG` — its key, display label, and the
 * controller method that emits it. `AUDIT_EVENTS`, `AuditAction`,
 * `AUDIT_EVENT_LABELS` and `AUDIT_WIRING` are derived from the catalog, so
 * adding a new action is a one-line catalog entry and nothing else can
 * drift.
 *
 * Naming contract: `resource.action` in past tense, snake_case action,
 * lowercase resource. `AUDIT_WIRING` (derived) is the machine-readable map
 * used by scenario S11 to assert every wired event traces to a real
 * controller method (guard coverage is asserted on top in M4).
 */
export interface AuditActionEntry {
  /** Machine action key, e.g. `workspace.created`. */
  action: string;
  /** English display name served via GET /workspaces/:id/audit/actions. */
  label: string;
  /** Controller class that emits the event (S11 wiring guard). */
  controller: string;
  /** Handler method on the controller that emits the event (S11). */
  method: string;
}

/**
 * One entry per audit action. The `as const` keeps the action values as a
 * literal union so `AuditAction` stays exhaustive; `satisfies` type-checks
 * every entry shape. Adding a new action = one entry here.
 */
export const AUDIT_ACTION_CATALOG = [
  // workspaces (1–12)
  { action: 'workspace.created', label: 'Workspace created', controller: 'WorkspacesController', method: 'createWorkspace' },
  { action: 'workspace.updated', label: 'Workspace updated', controller: 'WorkspacesController', method: 'updateWorkspace' },
  { action: 'workspace.deleted', label: 'Deleted workspace', controller: 'WorkspacesController', method: 'deleteWorkspace' },
  { action: 'workspace.config.updated', label: 'Updated workspace config', controller: 'WorkspacesController', method: 'updateWorkspaceConfigs' },
  { action: 'workspace.api_key.rotated', label: 'Rotated API key', controller: 'WorkspacesController', method: 'rotateApiKey' },
  { action: 'member.invited', label: 'Invited members', controller: 'WorkspacesController', method: 'createInvitations' },
  { action: 'member.invitation.cancelled', label: 'Cancelled invitation', controller: 'WorkspacesController', method: 'cancelInvitation' },
  { action: 'member.removed', label: 'Removed member', controller: 'WorkspacesController', method: 'removeMember' },
  { action: 'member.permissions.updated', label: 'Changed member permissions', controller: 'WorkspacesController', method: 'updateMemberPermissions' },
  { action: 'permission_group.created', label: 'Created permission group', controller: 'WorkspacesController', method: 'createPermissionGroup' },
  { action: 'permission_group.updated', label: 'Updated permission group', controller: 'WorkspacesController', method: 'updatePermissionGroup' },
  { action: 'permission_group.deleted', label: 'Deleted permission group', controller: 'WorkspacesController', method: 'deletePermissionGroup' },
  // targets (13–15)
  { action: 'target.created', label: 'Added scan target', controller: 'TargetsController', method: 'createMultipleTargets' },
  { action: 'target.updated', label: 'Updated scan target', controller: 'TargetsController', method: 'updateTarget' },
  { action: 'target.deleted', label: 'Deleted scan target', controller: 'TargetsController', method: 'deleteTarget' },
  // assets (16)
  { action: 'asset.deleted', label: 'Deleted asset', controller: 'AssetsController', method: 'deleteAsset' },
  // asset groups (17–18)
  { action: 'asset_group.created', label: 'Created asset group', controller: 'AssetGroupController', method: 'create' },
  { action: 'asset_group.deleted', label: 'Deleted asset group', controller: 'AssetGroupController', method: 'delete' },
  // internal networks (19–20)
  { action: 'network.created', label: 'Created network', controller: 'InternalNetworksController', method: 'createInternalNetwork' },
  { action: 'network.deleted', label: 'Deleted network', controller: 'InternalNetworksController', method: 'deleteInternalNetwork' },
  // vulnerabilities (21–22)
  { action: 'vulnerability.status.updated', label: 'Changed vulnerability status', controller: 'VulnerabilitiesController', method: 'bulkDismissVulnerabilities' },
  { action: 'vulnerability.bulk_updated', label: 'Bulk updated vulnerabilities', controller: 'VulnerabilitiesController', method: 'bulkReopenVulnerabilities' },
  // reports (23–25)
  { action: 'report.generated', label: 'Generated report', controller: 'ReportsController', method: 'generateSummaryReport' },
  { action: 'report.exported', label: 'Exported report', controller: 'ReportsController', method: 'previewSummaryReport' },
  { action: 'report.deleted', label: 'Deleted report', controller: 'ReportsController', method: 'deleteReport' },
  // jobs (26)
  { action: 'job.cancelled', label: 'Cancelled job', controller: 'JobsRegistryController', method: 'cancelJob' },
  // workflows (27–29)
  { action: 'workflow.created', label: 'Created workflow', controller: 'WorkflowsController', method: 'createWorkflow' },
  { action: 'workflow.updated', label: 'Updated workflow', controller: 'WorkflowsController', method: 'updateWorkflow' },
  { action: 'workflow.deleted', label: 'Deleted workflow', controller: 'WorkflowsController', method: 'deleteWorkflow' },
  // integrations (30–32)
  { action: 'integration.connected', label: 'Connected integration', controller: 'IntegrationsController', method: 'createIntegration' },
  { action: 'integration.disconnected', label: 'Disconnected integration', controller: 'IntegrationsController', method: 'deleteIntegration' },
  { action: 'integration.settings.updated', label: 'Updated integration settings', controller: 'IntegrationsController', method: 'updateIntegration' },
  // api keys (33–34)
  { action: 'api_key.created', label: 'Created API key', controller: 'ApiKeysController', method: 'create' },
  { action: 'api_key.revoked', label: 'Revoked API key', controller: 'ApiKeysController', method: 'revoke' },
  // audit (35)
  { action: 'audit.exported', label: 'Exported audit log', controller: 'AuditEventsController', method: 'exportAuditEvents' },
] as const satisfies readonly AuditActionEntry[];

/** Union of every catalog action key — the type for @AuditLog('...') and DTOs. */
export type AuditAction = (typeof AUDIT_ACTION_CATALOG)[number]['action'];

/**
 * All action keys, in catalog order. Used by the query DTO (`@IsIn`) and the
 * S10/S11 specs; derived, so it can never drift from the catalog.
 */
export const AUDIT_EVENTS = AUDIT_ACTION_CATALOG.map(
  (entry) => entry.action,
);

/**
 * English display names for every audit action — the source for the console
 * UI (action filter dropdown + table/sheet labels), served via
 * GET /workspaces/:id/audit/actions. Derived from the catalog; the S10 spec
 * asserts key order/completeness can never drift.
 */
export const AUDIT_EVENT_LABELS = Object.fromEntries(
  AUDIT_ACTION_CATALOG.map((entry) => [entry.action, entry.label]),
) as Record<AuditAction, string>;

/**
 * Validates `resource(.sub_resource).action` naming (e.g. `workspace.created`,
 * `workspace.api_key.rotated`, `permission_group.created`). One or more
 * `[a-z_]+` segments after the resource noun.
 * ponytail: plan §4 wrote `^[a-z]+\.[a-z_]+$` (single dot, no underscore in
 * the first segment), which cannot match `workspace.config.updated` /
 * `workspace.api_key.rotated` / `permission_group.created`; the
 * repeated-segment form below is the intent-preserving fix.
 */
export const AUDIT_EVENTS_RE = /^[a-z_]+(\.[a-z_]+)+$/;

/**
 * Static map action → controller class + method where the event will be
 * emitted (plan §6 wiring map). Derived from the catalog. Entries whose
 * endpoint does not exist in the v1 surface yet (asset delete, api key
 * create/revoke, audit export) point at the planned method on the module's
 * main controller; S11 tracks them via its NOT_YET_RESOLVABLE list until the
 * endpoint lands (M3/M4).
 */
export const AUDIT_WIRING: Record<
  AuditAction,
  { controller: string; method: string }
> = Object.fromEntries(
  AUDIT_ACTION_CATALOG.map((entry) => [
    entry.action,
    { controller: entry.controller, method: entry.method },
  ]),
) as Record<AuditAction, { controller: string; method: string }>;
