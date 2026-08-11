/**
 * v1 audit event dictionary (plan §4, rows 1–35 renumbered).
 *
 * Naming contract: `resource.action` in past tense, snake_case action,
 * lowercase resource. `AUDIT_WIRING` is the machine-readable map used by
 * scenario S11 to assert every wired event traces to a real controller
 * method (guard coverage is asserted on top in M4).
 */
export const AUDIT_EVENTS = [
  // workspaces (1–12)
  'workspace.created',
  'workspace.updated',
  'workspace.deleted',
  'workspace.config.updated',
  'workspace.api_key.rotated',
  'member.invited',
  'member.invitation.cancelled',
  'member.removed',
  'member.permissions.updated',
  'permission_group.created',
  'permission_group.updated',
  'permission_group.deleted',
  // targets (13–15)
  'target.created',
  'target.updated',
  'target.deleted',
  // assets (16)
  'asset.deleted',
  // asset groups (17–18)
  'asset_group.created',
  'asset_group.deleted',
  // internal networks (19–20)
  'network.created',
  'network.deleted',
  // vulnerabilities (21–22)
  'vulnerability.status.updated',
  'vulnerability.bulk_updated',
  // reports (23–25)
  'report.generated',
  'report.exported',
  'report.deleted',
  // jobs (26)
  'job.cancelled',
  // workflows (27–29)
  'workflow.created',
  'workflow.updated',
  'workflow.deleted',
  // integrations (30–32)
  'integration.connected',
  'integration.disconnected',
  'integration.settings.updated',
  // api keys (33–34)
  'api_key.created',
  'api_key.revoked',
  // audit (35)
  'audit.exported',
] as const;

export type AuditAction = (typeof AUDIT_EVENTS)[number];

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
 * emitted (plan §6 wiring map). Controller/method names were verified against
 * the actual controllers. Entries whose endpoint does not exist in the v1
 * surface yet (asset delete, api key create/revoke, audit export) point at
 * the planned method on the module's main controller; S11 tracks them via its
 * NOT_YET_RESOLVABLE list until the endpoint lands (M3/M4).
 */
export const AUDIT_WIRING: Record<
  AuditAction,
  { controller: string; method: string }
> = {
  'workspace.created': { controller: 'WorkspacesController', method: 'createWorkspace' },
  'workspace.updated': { controller: 'WorkspacesController', method: 'updateWorkspace' },
  'workspace.deleted': { controller: 'WorkspacesController', method: 'deleteWorkspace' },
  'workspace.config.updated': { controller: 'WorkspacesController', method: 'updateWorkspaceConfigs' },
  'workspace.api_key.rotated': { controller: 'WorkspacesController', method: 'rotateApiKey' },
  'member.invited': { controller: 'WorkspacesController', method: 'createInvitations' },
  'member.invitation.cancelled': { controller: 'WorkspacesController', method: 'cancelInvitation' },
  'member.removed': { controller: 'WorkspacesController', method: 'removeMember' },
  'member.permissions.updated': { controller: 'WorkspacesController', method: 'updateMemberPermissions' },
  'permission_group.created': { controller: 'WorkspacesController', method: 'createPermissionGroup' },
  'permission_group.updated': { controller: 'WorkspacesController', method: 'updatePermissionGroup' },
  'permission_group.deleted': { controller: 'WorkspacesController', method: 'deletePermissionGroup' },
  'target.created': { controller: 'TargetsController', method: 'createMultipleTargets' },
  'target.updated': { controller: 'TargetsController', method: 'updateTarget' },
  'target.deleted': { controller: 'TargetsController', method: 'deleteTarget' },
  'asset.deleted': { controller: 'AssetsController', method: 'deleteAsset' },
  'asset_group.created': { controller: 'AssetGroupController', method: 'create' },
  'asset_group.deleted': { controller: 'AssetGroupController', method: 'delete' },
  'network.created': { controller: 'InternalNetworksController', method: 'createInternalNetwork' },
  'network.deleted': { controller: 'InternalNetworksController', method: 'deleteInternalNetwork' },
  'vulnerability.status.updated': { controller: 'VulnerabilitiesController', method: 'bulkDismissVulnerabilities' },
  'vulnerability.bulk_updated': { controller: 'VulnerabilitiesController', method: 'bulkReopenVulnerabilities' },
  'report.generated': { controller: 'ReportsController', method: 'generateSummaryReport' },
  'report.exported': { controller: 'ReportsController', method: 'previewSummaryReport' },
  'report.deleted': { controller: 'ReportsController', method: 'deleteReport' },
  'job.cancelled': { controller: 'JobsRegistryController', method: 'cancelJob' },
  'workflow.created': { controller: 'WorkflowsController', method: 'createWorkflow' },
  'workflow.updated': { controller: 'WorkflowsController', method: 'updateWorkflow' },
  'workflow.deleted': { controller: 'WorkflowsController', method: 'deleteWorkflow' },
  'integration.connected': { controller: 'IntegrationsController', method: 'createIntegration' },
  'integration.disconnected': { controller: 'IntegrationsController', method: 'deleteIntegration' },
  'integration.settings.updated': { controller: 'IntegrationsController', method: 'updateIntegration' },
  'api_key.created': { controller: 'ApiKeysController', method: 'create' },
  'api_key.revoked': { controller: 'ApiKeysController', method: 'revoke' },
  'audit.exported': { controller: 'AuditEventsController', method: 'exportAuditEvents' },
};
