import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { NotificationsController } from './notifications.controller';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

describe('NotificationsController workspace permission guards', () => {
  const reflector = new Reflector();

  it.each([
    ['getNotifications', 'GET /'],
    ['getUnreadCount', 'GET /unread-count'],
  ])(
    '%s (%s) is auth-only — no workspace permission required (per-recipient, invitees pre-membership)',
    (method, _route) => {
      const handler = (
        NotificationsController.prototype as Record<string, unknown>
      )[method] as object;
      const required = reflector.getAllAndOverride(WorkspacePermissions, [
        handler,
        NotificationsController,
      ]);
      expect(required).toBeUndefined();
    },
  );

  it.each([
    ['markAllAsRead', 'PATCH /mark-read'],
    ['markAllAsUnread', 'PATCH /mark-unread'],
    ['markAsRead', 'PATCH /:id/read'],
    ['deleteNotification', 'DELETE /:id'],
  ])('%s (%s) stays unguarded (per-user state, no write key in catalog)', (method, _route) => {
    const handler = (
      NotificationsController.prototype as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      NotificationsController,
    ]);
    expect(required).toBeUndefined();
  });

  it('createNotification (POST /) requires workspace membership', () => {
    const handler = (
      NotificationsController.prototype as Record<string, unknown>
    ).createNotification as object;
    // Empty permission list = any authenticated member of the authorized
    // workspace; there is no notification.* write key in the catalog.
    expect(reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      NotificationsController,
    ])).toEqual([]);
  });
});
