# notifications module

In-app notifications: the read side (list, unread count, read/unread, delete) plus `createNotification` for hand-picked recipient lists. `@Global()`, registered in `app.module.ts` (not `combine.module.ts`).

Workspace-addressed notifications are NOT written here: the event bridge `notifications` lane (`event-bridge/sinks/notifications/`) turns events into rows. The live push is `GET /events/stream` in the events module. The doc comment in `notifications.module.ts` still says "SSE stream"; this module has no stream route.

## Layout

- `notifications.controller.ts`: HTTP routes.
- `notifications.service.ts`: queries, status changes, `createNotification`, `deleteByRef`.
- `notification-cursor.ts`: keyset cursor encode/decode and `CURSOR_TS_SQL`.
- `entities/notification.entity.ts`, `entities/notification-recipient.entity.ts`.
- `dto/`: `CreateNotificationDto` (internal only), `GetNotificationsQueryDto`, `DeleteNotificationByRefDto`.

## Public surface

All routes are under `notifications`, need authentication only (`AuthGuard`, no `@WorkspaceAccess`), and are scoped to the caller's `userId`.

| Route | Behaviour |
|---|---|
| `GET notifications` | keyset pagination (`cursor`, `limit` 1-100, default 20), newest first. With a workspace (header/cookie via `getWorkspaceIdFromRequest`): that workspace plus workspace-less rows. Without one: workspace-less rows only |
| `GET notifications/unread-count` | counts `status = sent` across all workspaces |
| `PATCH notifications/mark-read` | every row of the user → `read` |
| `PATCH notifications/mark-unread` | only `sent` → `unread` (clears the "new" badge; `read` rows stay read) |
| `PATCH notifications/:id/read` / `:id/unread` | one row → `read` / `unread` |
| `DELETE notifications/by-ref?ref=&refId=` | the caller's recipient rows for that ref |
| `DELETE notifications/:id` | the caller's recipient row |

- `:id` is the **recipient row id** (`notification_recipients.id`, which the list returns as `id`), not `notifications.id`.
- There is no `POST /notifications`. It was removed on purpose (any user could notify arbitrary user ids, and the `notification` permission resource has no `write` action). Do not add it back.
- Exports `NotificationsService`. `createNotification(dto)` delegates to `NotificationsSink.deliver`. `deleteByRef(ref, refId, userId?)`: with `userId` it deletes only that user's recipient rows; without it it deletes the `notifications` rows for everyone (recipients cascade).

## Data model

- `notifications`: `scope`, `type` (`NotificationType`), `metadata` jsonb (string map, used as i18n arguments), optional `ref` / `refId` (indexed together), nullable `workspaceId` (cascade on workspace delete).
- `notification_recipients`: `notificationId` (cascade), `userId` (cascade), `status` `sent | unread | read`, default `sent`. Index `IDX_notif_recipient_userId` on (`user`, `createdAt`) serves both filter and order.
- Hard deletes only. There is no event-id column; the bridge dedupes redeliveries with a Redis marker.

## Invariants

- Status meaning: `sent` = new (counted by the badge), `unread` = seen but not opened, `read`.
- Text and link are rendered at read time, not stored: `i18n.translate('notification.<type>')` with `metadata` as arguments in the request language, and the URL from the pseudo-language `routers`. A new `NotificationType` needs keys in `src/i18n/en/notification.json` and `src/i18n/routers/notification.json`.
- Cursor = base64url(`createdAt|id`). `createdAt` is the microsecond string from `CURSOR_TS_SQL`, never a JS `Date` (milliseconds would skip rows created in the same millisecond). Malformed or impossible values give 400. Order is `createdAt DESC, id DESC` and the query fetches `limit + 1` without counting.
- The row shape is defined once, in `NotificationsSink.deliver`; both the bridge lane and `createNotification` go through it.

## Coupling

- Injects `NotificationsSink`, exported by the global `EventBridgeModule`. The bridge also registers `Notification`, `NotificationRecipient` and `User` and writes these tables itself.
- Which events notify whom: `event-bridge/sinks/notifications/notification-rules.ts`, not this module.
- Only `WorkspacesService` calls this service today (`createNotification` for invitations, `deleteByRef` three times). The controller comment that lists data-adapter, statistic and the vulnerability processor as callers is out of date. `VulnerabilitiesService` injects `NotificationsService` but never calls it. `StatisticModule` and `VulnerabilitiesModule` import `NotificationsModule` even though it is global.

## Gotchas

- `deliver` saves the `notifications` row before it looks up the users. If none of the recipient ids exist, a notification with no recipients is left behind.
- The workspace filter on the list is not a membership check. That is harmless because the rows are always the caller's own.

## Testing

`notifications.service.spec.ts`, `notifications.controller.spec.ts`, `notification-cursor.spec.ts`. The fan-out itself is tested in `event-bridge/sinks/notifications/notifications.sink.spec.ts`.
