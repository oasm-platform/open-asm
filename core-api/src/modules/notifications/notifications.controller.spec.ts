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

  // createNotification used to be in the list above. Every caller is an internal
  // service and the console never called the route, so the endpoint was removed
  // rather than gated — it let any authenticated user notify arbitrary users.
  it('createNotification (POST /) is no longer exposed', () => {
    expect(
      (NotificationsController.prototype as Record<string, unknown>)
        .createNotification,
    ).toBeUndefined();
  });
});
