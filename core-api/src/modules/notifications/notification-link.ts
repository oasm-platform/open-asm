import { NotificationType } from '@/common/enums/enum';

/** Fill {placeholders} with string args; unknown keys stay untouched. */
function fill(template: string, args: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    typeof args[key] === 'string' ? args[key] : m,
  );
}

const STATIC_URLS: Partial<Record<NotificationType, string>> = {
  WORKSPACE_CREATED: '/settings/workspaces',
  VULNERABILITY_ANALYSIS_COMPLETED: '/vulnerabilities/{id}?tab=analysis',
  ASSET_NEW_DETECT: '/targets/{targetId}/inventory?isNew=true',
  NEW_VULNERABILITY_FOUND: '/targets/{targetId}/vulnerabilities',
  NEW_URL_FOUND: '/targets/{targetId}/inventory?tab=urls&isNew=true',
  REPORT_GENERATED: '/reports',
  REPORT_FAILED: '/reports',
};

export function buildNotificationUrl(
  type: NotificationType,
  args: Record<string, string>,
): string {
  if (type === NotificationType.WORKSPACE_INVITATION) {
    if (args['action'] === 'accepted' || args['action'] === 'declined')
      return '/settings/members';
    return fill('/invite/{token}', args);
  }
  const template = STATIC_URLS[type];
  return template ? fill(template, args) : '/notifications';
}
