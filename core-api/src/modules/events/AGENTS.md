# events module

`GET /events/stream`: the single Server-Sent Events connection the console keeps open. It merges the caller's notification pushes with allowlisted event-bus events of one workspace. Registered in `combine.module.ts`. No entities, no exports.

## Layout

- `events.controller.ts`: the route and the workspace resolution.
- `events.service.ts`: per-replica fan-out (`EventsService.stream`), heartbeat, Redis read loop and pattern subscription.
- `client-events.ts`: `CLIENT_EVENTS` allowlist, the `ClientEvent` shape, `isClientEvent`, `NOTIFICATION_CREATED`.

## Public surface

| Route | Permission |
|---|---|
| `GET events/stream` (`@Sse`) | authenticated only (`AuthGuard`); no `@WorkspaceAccess`, membership is checked by hand |

- The workspace comes from the `X-Workspace-Id` header **only**, never the `wid` cookie (the cookie is shared by all tabs). No header gives a notifications-only stream. A non-UUID gives 400; a non-member gets 403 (the `NotFoundException` from `getMembershipWithPermissions` is rewritten so workspace existence does not leak).
- Each message is an unnamed SSE event whose data is a `ClientEvent` `{ id, type, time, resourceType, resourceId, joinKeyId? }`. A named `ping` event goes out every `HEARTBEAT_MS` (25 s).

## Invariants

- **Allowlist, not denylist.** Only `notification.*`, `worker.*`, `target.*`, `workflow.*` reach browsers. The stream also carries API key rotations, permission changes and audit exports, so a new catalog event is private until someone adds it to `CLIENT_EVENTS`.
- **Ids only, never payloads.** A client gets name, ids and time and refetches through REST, which applies permissions. The only metadata passed through is `metadata.joinKeyId` on `worker.joined`. Do not add `payload`, `changes`, actor or IP fields.
- Workspace events are matched on `data.workspaceId`, decoded with the bridge's own `parseData`, so an entry missing `workspaceId` or `outcome` is not forwarded.
- Membership is the only check: any member, whatever their permissions, sees the ids/types of allowlisted events of that workspace.
- The bus is read with ONE plain `XREAD` loop per replica (connection name `events:live`), never a consumer group, because the SSE client may be connected to any replica. The loop runs only while at least one workspace connection is open and starts at `XLAST`: no backlog, no replay of what was missed while disconnected.
- Notifications use ONE `PSUBSCRIBE notification:*` per replica, routed in memory by user id; the push becomes `type: notification.created`, `resourceType: 'notification'`, `resourceId = notificationId`. A failed subscribe is forgotten and retried on the next connection.

## Coupling

- Uses the global `WorkspacesService.getMembershipWithPermissions` and `RedisService` (`xlast`, `xread`, `psubscribe`); the module imports nothing.
- Imports `NOTIFICATION_CHANNEL_PREFIX` from `event-bridge/sinks/notifications/notifications.sink.ts` (the publisher is `NotificationsSink.deliver`) and `parseData` from `event-bridge/transport/stream-codec.ts`. A change to either side's format breaks this stream.
- `workflow.*` covers the `workflow.run.*` events published by jobs-registry.

## Gotchas

- `notification.*` also matches the bridge leaves `notification.sent` / `notification.failed`. Nothing publishes them today; if something starts to, they will reach every member's tab.
- All listener state is in memory per replica; there is nothing to clean up in Redis.

## Testing

`events.service.spec.ts` (allowlist, ids-only forwarding, single read loop, subscription retry, disconnect) and `events.controller.spec.ts`.
