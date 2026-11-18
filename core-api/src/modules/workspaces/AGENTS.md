# workspaces module

Tenants: workspaces, their members, permission groups and invitations. It also owns the membership lookup that `WorkspacePermissionGuard` (in `src/common/guards/`) runs on every workspace-scoped route.

## Layout

- `workspaces.module.ts`: `@Global()` on purpose: `WorkspacePermissionGuard` (behind `@WorkspaceAccess`, on controllers in some 20 modules) injects `WorkspacesService`, so this module is the tenancy kernel, like `AuthModule`. Exports `WorkspacesService`. Imports `ApiKeysModule`, `ArtifactsModule`, `NotificationsModule`.
- `workspaces.controller.ts`: all `/workspaces` routes.
- `workspaces.service.ts`: CRUD, configs, api key, invitations; `getMembershipWithPermissions` delegates to the membership service and stays here for the guard and other modules.
- `workspace-members.service.ts` (`WorkspaceMembersService`): list members with their groups, replace a member's groups, remove a member (`assertMemberMutable`, audit rows in the same transaction, pseudonymization after commit).
- `workspace-permission-groups.service.ts` (`WorkspacePermissionGroupsService`): the permission catalog, group CRUD, `seedOwnerPermissionGroup` (called inside the creation transaction), and the no-escalation checks members and invitations share (`assertCanGrantGroups`, `findValidPermissionGroups`). Exports `OWNER_PERMISSION_GROUP_NAME` and `WILDCARD_PERMISSION`.
- `workspace-membership.service.ts` (`WorkspaceMembershipService`): the membership row plus the union of the member's permission keys (`getMembershipWithPermissions`), and `getCurrentPermission`.
- `permission-catalog.json`: the list of valid `resource.action` keys. Read from disk at call time by `getPermissionCatalog()` (shipped to `dist/` through the `**/*.json` asset rule in `nest-cli.json`).
- `entities/`: `Workspace`, `WorkspaceMembers`, `WorkspacePermission`, `WorkspaceMemberPermission`, `WorkspaceInvitation`.
- `workspaces.doc.ts`: `GetManyWorkspaceDoc()` is unused and does not return its decorator.

## How workspace access resolves (used by every module)

- `@WorkspaceAccess(...keys, { workspaceParam? })` (`common/decorators/workspace-access.decorator.ts`) = `UseGuards(WorkspacePermissionGuard)` + `@WorkspacePermissions(keys)`. No keys means any member passes.
- The guard picks the workspace id in this order: `:workspaceId` param, the param named by `workspaceParam`, the `X-Workspace-Id` header / `wid` cookie (`getWorkspaceIdFromRequest`), and last the generic `:id` param. On feature routes `:id` is an entity id, so a request without the header ends in a 403, not a lookup of that entity.
- A non-UUID id is a 400. A non-member gets 403, never 404.
- It sets `request.workspaceId`, `request.membership` and `request.permissions` (union of keys over all the member's groups).
- Passes when the keys contain `*`, or hold every required key. `x.write` implies `x.read`, nothing else is implied.
- `@WorkspaceId()` reads only the header/cookie and never the route param. On `/workspaces/:id` routes the service gets `id` from `@Param`.
- The guard only runs where `@WorkspaceAccess` is applied. The global `AuthGuard` checks the session only. A route without the decorator has no tenant check at all.

## Public surface

| Route | Permission |
|---|---|
| `POST /workspaces` | session only; max `LIMIT_WORKSPACE_CREATE` (5) owned workspaces |
| `GET /workspaces` | session only; lists the user's memberships and sets the `wid` cookie |
| `GET /workspaces/current-permission` | `@WorkspaceAccess()` |
| `GET api-key`, `POST :id/api-key/rotate` | `workspace.apikey` |
| `GET/PATCH configs` | `workspace.config` |
| `GET members`, `GET permissions`, `GET permissions/catalog`, `GET invitations` | `member.read` (the invitation list also uses `member.read`) |
| `PATCH/DELETE members/:memberId` | `member.write` |
| `POST/PATCH/DELETE permissions[/:permissionId]` | `workspace.write` |
| `POST invitations`, `POST invitations/:invitationId/cancel` | `invitation.write` |
| `POST invitations/accept`, `POST invitations/decline` | session only; the email must match |
| `GET invitations/:token` | `@Public()` preview |
| `GET/PATCH/DELETE :id`, `PATCH :id/archived` | `workspace.read` / `workspace.write` / `workspace.delete` with `workspaceParam: 'id'` |

Events (via `@PublishEvent`): `workspace.created`, `workspace.updated` (update and archive), `workspace.config.updated`, `workspace.api_key.rotated`, `member.invited`, `member.invitation.cancelled`. Workspace delete, member update/remove and permission group CRUD do not publish. They write audit rows with `AuditService.recordInTx` in the same transaction.

Service methods other modules call: `getMembershipWithPermissions` (guard, events, storage, agent tools), `getWorkspaceByIdAndOwner` (targets, internal-networks, agents skills), `getWorkspaceConfigValue`, `getWorkspacesByIds` (loads `owner`), `getMemberOfWorkspaceByJobId`.

## Data model

- `workspaces`: `owner` FK with `ON DELETE CASCADE` from `users`, so deleting a user wipes their workspaces. That is why user deletion is disabled in `auth.ts`. Has a `deletedAt` column, but `deleteWorkspace` **hard-deletes** (`manager.delete`, with the audit row in the same transaction) after awaiting `WORKSPACE_DELETING_EVENT`, on which the targets module deletes the workspace's targets in its own statement. Artifact objects are removed in the background (`artifactsService.deleteWorkspaceObjects`).
- `dek` / `dekAt`: a wrapped per-workspace data key, generated at create with `WorkspaceEncryptionService.generateWrappedDEK()` (`src/services/workspace-encryption/`). That service caches unwrapped DEKs and backfills missing ones at boot. Never write `dek` yourself.
- `settings` (jsonb, keyed by section) exists, but nothing in this module reads or writes it.
- `Workspace` declares inverse relations only for its own tables (`workspaceMembers`, `permissions`). Workers, tools, statistics, workflows and internal networks point at it one-way.
- `apiKey` is a one-to-one relation (`apiKeyId`) that is set on rotate. Lookups go through `ApiKeysService.getCurrentApiKey(WORKSPACE, workspaceId)`, not this column. `GET api-key` creates a key on first call.
- `workspace_members`: the unique `(workspaceId, userId)` index `IDX_wm_workspace_user_unique` exists only in migration `1786002229271`, not on the entity. A generated migration may try to drop it.
- `workspace_permissions`: unique `(workspace, name)`. The service also checks names case-insensitively. `permissions` is a `text[]`. `isSystem` marks the `Admin` group (`OWNER_PERMISSION_GROUP_NAME`, holds `['*']`).
- `workspace_member_permissions`: member ↔ group join table, both sides cascade.
- `workspace_invitations`: stores only `tokenHash` (sha256), `permissionIds uuid[]`, status `InvitationStatus`, 7-day `expiresAt`. Cancelling sets status `CANCELLED` and keeps the row.

## Invariants

- Create runs the workspace, the owner membership and `seedOwnerPermissionGroup` in one transaction. Default workflows are created afterwards, outside it.
- `*` is reserved for the system group: create/update of a group rejects it, and system groups cannot be edited or deleted.
- Group keys must exist in `permission-catalog.json`. `template.read/write` (`RETIRED_PERMISSION_KEYS`) are dropped silently.
- No privilege escalation: you may only grant keys or groups whose keys you already hold (`assertCanGrantPermissionKeys`, `assertCanGrantGroups`). Holding `*` bypasses this.
- `assertMemberMutable`: you cannot change your own membership, the owner, or any holder of a system group.
- Invitations go only to emails that already have accounts and are not yet members. The response returns counts only, so it never reveals which emails exist. System groups cannot be assigned by invite. Accept is a conditional `PENDING → ACCEPTED` update, so it consumes the token once, and it only adds groups. Archived workspaces refuse invite and accept.
- `getWorkspaceByIdAndOwner` checks ownership, not permissions. Routes behind it reject non-owner members even when they hold the key.

## Coupling

- No dependency on the workflows module: `createWorkspace` emits `WORKSPACE_INITIALIZING_EVENT` (`workspace.events.ts`) with `emitAsync` after the transaction commits and awaits it. `WorkflowTemplateService` creates the default workflows on it; its failure fails the creation (`suppressErrors: false`).
- Imports `NotificationsModule` for `NotificationsService`; uses the global `AuditService` and `WorkspaceEncryptionService`.
- These write the `workspaces` table directly: `admin/workspaces` (name, description, configs, `archivedAt`), `WorkspaceEncryptionService` (`dek`), plus reads in reports, statistic, artifact quota and workflow-template. `admin/users` and `artifacts` read `workspace_members`.
- Writes no other module's table. `deleteWorkspace` emits `WORKSPACE_DELETING_EVENT` (`workspace.events.ts`) with `emitAsync` before the workspace row goes; `TargetsService.onWorkspaceDeleting` (`suppressErrors: false`) removes the targets, and a failure there keeps the workspace. It still reads `targets` (`getWorkspaceIdByTargetId`) and `jobs` (`getMemberOfWorkspaceByJobId`).

## Testing

`workspaces.service.spec.ts` (large), `workspace-membership.service.spec.ts`, `workspace-members.service.spec.ts`, `workspace-permission-groups.service.spec.ts`, `workspaces.controller.spec.ts` (permission metadata and audit wiring). The guard and decorators have specs in `src/common/guards/` and `src/common/decorators/`.
