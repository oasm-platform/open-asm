# admin module

Platform-admin endpoints under `/admin/*`: the first-admin bootstrap, tool creation, system configs and settings (logo, sign-up, mail server), and read/manage access to all users and workspaces.

## Layout

- `admin.module.ts`: imports the three submodules. No exports.
- `admin.controller.ts` / `admin.service.ts`: `POST /admin/init`, `POST /admin/tools`.
- `admin.decorator.ts` / `admin.guard.ts`: `@Admin()` = `@Roles(Role.ADMIN)` + `@UseGuards(AdminGuard)`. `AdminGuard` holds admin-only checks beyond the role; today only the admin IP allow-list.
- `system-configs/`: `SystemConfigsModule` (exports `SystemConfigsService`), `SystemConfigsController`, `MailService`, `SignUpHook`, entity `SystemConfig`.
- `users/`: `AdminUsersModule`, `AdminUsersController`, `AdminUsersService` (`toAdminUserDto`), `PendingApprovalHook`.
- `workspaces/`: `AdminWorkspacesModule`, `AdminWorkspacesController`, `AdminWorkspacesService`.

## Public surface

Every controller has class-level `@Admin()` (not bare `@Roles(Role.ADMIN)`; `admin.guard.spec.ts` asserts it for all four). The global `AuthGuard` runs first (session + role), then `AdminGuard` refuses with 403 when the client IP (`requestClientIp`, honours `TRUSTED_PROXIES`) is not in `settings.adminAccess.allowedIps`. An empty list allows every IP. `AdminGuard` also runs on the `@Public()` `POST /admin/init`. Workspace permissions do not apply here: admins bypass membership.

| Route | Notes |
|---|---|
| `POST /admin/init` | `@Public()`. Refused (403) once any admin exists. 409 while another init holds the lock |
| `POST /admin/tools` | `ToolsService.createTool` |
| `GET/PUT /admin/system-configs` | name + logo. `GET` returns a signed logo URL, never the raw path |
| `GET/PATCH /admin/system-configs/settings` | `GET` uses `getSettingsView()` (mail password removed, `hasPassword` added) |
| `POST /admin/system-configs/settings/mail-server/test` | sends a test mail. SMTP errors come back as 400 |
| `POST logo/presign`, `POST logo/confirm`, `DELETE logo` | direct-to-storage upload into bucket `system`, prefix `logo` |
| `GET /admin/users[/:id]` | replaces better-auth's disabled `/admin/list-users` and `/admin/get-user`. The list excludes `Role.BOT` and accepts a `workspaceId` filter |
| `GET /admin/workspaces[/:id]`, `PATCH :id`, `PATCH :id/archived` | all workspaces, including archived |
| `PATCH /admin/workspaces/:id/storage-quota` | `ArtifactQuotaService.setQuota`. `null` resets to the default |

Events: `workspace.updated` (admin update and archive), `storage.quota.updated`.
Ban, unban, create-user and impersonation are better-auth admin-plugin routes under `/api/auth/admin/*`, not controllers here.

## better-auth hooks (`@Hook()` providers, wired by `AuthModule`)

- `SignUpHook` `@BeforeHook('/sign-up/email')`: throws `FORBIDDEN` unless `isSignUpAllowed()`, which needs **both** `settings.auth.allowSignUp` and `settings.mailServer.enabled`. It skips calls without `ctx.request`, so the server-side bootstrap passes.
- `PendingApprovalHook` `@BeforeHook('/admin/unban-user')`: refuses to approve a pending sign-up whose email is unverified while the mail server is on. `@AfterHook('/sign-in/email')` replaces `BANNED_USER` with `EMAIL_NOT_VERIFIED` for those accounts. It runs after the password check, so it reveals nothing to someone guessing.
- "Pending approval" means `banned = true` and `banReason = PENDING_APPROVAL_REASON` (set in `auth.ts` `databaseHooks`). Approving is unbanning.

## Data model

- `system_configs`: a single row. `findOrCreateConfig()` creates it lazily. Columns: `name`, `logoPath` (`<bucket>/<key>`), `settings` jsonb keyed by section.
- `SystemConfigsService.DEFAULT_SETTINGS` fills in missing sections on read. Defaults: `auth.allowSignUp = false`, `adminAccess.allowedIps = []`, mail server off.
- `settings.adminAccess.allowedIps`: IPs or CIDR ranges (validated by `isIpOrCidr`, max 100). `updateSettings` trims and de-duplicates them, and refuses (400) a non-empty list that does not cover the saving admin's own IP, so they can't lock themselves out. Recovery if locked out anyway: clear the list in the `system_configs.settings` row.
- `updateSettings` merges per section with one SQL `jsonb` statement, so concurrent saves of different fields don't overwrite each other. Don't replace it with load-modify-save.
- `settings.mailServer.password` is encrypted with the global `encrypt()` (system KEK, not a workspace DEK). An empty password in a PATCH keeps the stored one. It is listed in `SECRET_COLUMNS` (`encryption-upgrade.service.ts`), so a new secret in `settings` must be added there too.

## Invariants

- First admin: `bootstrapAdmin` runs under `@Lock('admin-init')` (Redis, shared across instances). It signs up through `AuthService.api.signUpEmail`, then sets `role = admin` and `emailVerified = true`. If that update fails, it deletes the half-created user. `createFirstAdmin` then calls `signInEmail` but throws the result away, so the response sets **no** session cookie.
- `logo/confirm` rejects keys that contain `/`, `\` or `..`. The stored `ContentType` must equal the MIME type of the key's extension (allow-list in `allowedImageExtensions`), and the size must be 5 MB or less. The previous logo object is deleted best-effort.
- The list endpoints map `sortBy` through a `SORT_COLUMNS` allow-list. Keep that when adding sort fields.
- `AdminUserDto` exposes email and ban fields. This is the one place where user data goes beyond `id/name/image`, and it is admin-only.

## Coupling

- `AdminGuard` injects `SystemConfigsService`, so every module with an `@Admin()` controller imports `SystemConfigsModule` (including `AdminWorkspacesModule`). Controller specs that compile a `TestingModule` must provide it.
- The IP allow-list does not cover better-auth's `/api/auth/admin/*` routes (ban, set-role, impersonate, create-user): they are served by the better-auth handler, not Nest controllers.
- `SystemConfigsModule` is imported by `AdminUsersModule`, `AdminWorkspacesModule` and `RootModule` (`GET /metadata` uses `getConfig` and `isSignUpAllowed`). It is not global.
- `ToolsService` and `StorageService` come from global modules. `combine.module.ts` keeps `AdminModule` below `JobsRegistryModule` to avoid the tools ↔ workers ↔ jobs-registry import cycle. Don't reorder.
- `AdminWorkspacesService` writes the `workspaces` table directly and does not go through `WorkspacesService`. `AdminUsersService` reads `workspace_members` with raw SQL and presence through `UserPresenceService`.
- `MailService` injects `AUTH_INSTANCE_KEY` and sets `emailVerification.sendVerificationEmail` in `onModuleInit`.

## Gotchas

- `SystemConfigsService.onModuleInit` calls `checkUpdate()`, which fetches the latest GitHub release when the Redis cache (`version:latest`, `version:last_check`) is older than 12 h. It also runs daily at 03:00 (`@Cron`). Failures are only logged.
- `GET /admin/users/:id` does not exclude the bot user. The list does.

## Testing

Specs exist for every service, controller and hook here except `admin-users.controller.ts`.
