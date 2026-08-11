/**
 * Display labels for audit event actions.
 * Keys must match the `action` values emitted by the audit backend
 * (see core-api audit action constants).
 */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  'workspace.created': 'Workspace created',
  'workspace.updated': 'Workspace updated',
  'workspace.deleted': 'Workspace deleted',
  'workspace.config.updated': 'Workspace config updated',
  'workspace.api_key.rotated': 'Workspace API key rotated',
  'member.invited': 'Invited member',
  'member.invitation.cancelled': 'Invitation cancelled',
  'member.removed': 'Removed member',
  'member.permissions.updated': 'Changed member permissions',
  'permission_group.created': 'Permission group created',
  'permission_group.updated': 'Permission group updated',
  'permission_group.deleted': 'Permission group deleted',
  'target.created': 'Target created',
  'target.updated': 'Target updated',
  'target.deleted': 'Target deleted',
  'asset.deleted': 'Asset deleted',
  'asset_group.created': 'Asset group created',
  'asset_group.deleted': 'Asset group deleted',
  'network.created': 'Network created',
  'network.deleted': 'Network deleted',
  'vulnerability.status.updated': 'Vulnerability status updated',
  'vulnerability.bulk_updated': 'Vulnerabilities bulk updated',
  'report.generated': 'Report generated',
  'report.exported': 'Report exported',
  'report.deleted': 'Report deleted',
  'job.cancelled': 'Job cancelled',
  'workflow.created': 'Workflow created',
  'workflow.updated': 'Workflow updated',
  'workflow.deleted': 'Workflow deleted',
  'integration.connected': 'Integration connected',
  'integration.disconnected': 'Integration disconnected',
  'integration.settings.updated': 'Integration settings updated',
  'api_key.created': 'API key created',
  'api_key.revoked': 'API key revoked',
  'audit.exported': 'Audit log exported',
};

/**
 * Returns a human-readable label for an audit action.
 * Falls back to a humanized version of the raw action key
 * (e.g. `workspace.created` -> `workspace created`).
 */
export function getAuditEventLabel(action: string): string {
  return AUDIT_EVENT_LABELS[action] ?? action.replace(/\./g, ' ');
}
