import { NotificationType } from '@/common/enums/enum';

/** Fill {placeholders} with string args; unknown keys stay untouched. */
function fill(template: string, args: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    typeof args[key] === 'string' ? args[key] : m,
  );
}

const STATIC_URLS: Partial<Record<NotificationType, string>> = {
  // ponytail: NotificationType imported as a value only for the integer check
  // below; all static urls stay in the lookup above. Collapse into one map
  // keyed by NotificationType.X when the next branch is added.
  WORKSPACE_CREATED: '/settings/workspaces',
  VULNERABILITY_ANALYSIS_COMPLETED: '/vulnerabilities/{id}?tab=analysis',
  ASSET_NEW_DETECT: '/targets/{targetId}/inventory?isNew=true',
  NEW_VULNERABILITY_FOUND: '/targets/{targetId}/vulnerabilities',
  NEW_URL_FOUND: '/targets/{targetId}/inventory?tab=urls&isNew=true',
};

export function buildNotificationUrl(
  type: NotificationType,
  args: Record<string, string>,
): string {
  if (type === NotificationType.WORKSPACE_INVITATION) {
    if (args['action'] === 'created') return fill('/invite/{token}', args);
    if (args['action'] === 'accepted' || args['action'] === 'declined')
      return '/settings/members';
    return '/invite/{token}';
  }
  const template = STATIC_URLS[type];
  return template ? fill(template, args) : '/notifications';
}
