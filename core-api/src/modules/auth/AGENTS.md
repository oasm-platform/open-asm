# auth module

Wires the better-auth instance into Nest: it mounts the handler on `/api/auth/*`, runs `@Hook()` providers, caches sessions in Redis and tracks user presence. The guard that checks every request is `AuthGuard` in `src/common/guards/auth.guard.ts`.

## Layout

- `auth.ts`: the better-auth instance (`auth`). It is built at import time, outside Nest DI, with its own `pg` `Pool` and its own Redis connection (shared by the session cache and the rate limiter).
- `rate-limit-storage.ts`: better-auth rate-limit `customStorage` in Redis (`createRateLimitStorage`, keys `auth-rate-limit:*`).
- `auth.module.ts`: `@Global()` `AuthModule.forRoot()`, called once in `combine.module.ts` with `disableExceptionFilter: true` and `disableTrustedOriginsCors: true` (CORS is set once, for every route, in `bootstrap/configure-app.ts`; `AuthModule.configure` would throw on the function-form `trustedOrigins` otherwise). Provides and exports `AUTH_INSTANCE_KEY`, `AUTH_MODULE_OPTIONS_KEY`, `AuthService`, `UserPresenceService`.
- `auth.service.ts`: thin wrapper (`.api`, `.instance`).
- `session-storage.ts`: better-auth `secondaryStorage` backed by Redis (`createSessionStorage`, `createSessionRedis`).
- `user-presence.service.ts`: last-request time per user in Redis (`presence:<userId>`, 30-day TTL).
- `auth-env.ts`: `resolveAuthSecret()`, and `resolveSigningSecret()` (the same secret, or better-auth's public fallback in local/test runs) for other signatures derived from it: attack-surface-query cursors use it. `auth-logger.ts`: routes better-auth logs into Nest's logger.
- `entities/`: `User`, `Session`, `Account`, `Verification` (tables `users`, `sessions`, `accounts`, `verifications`).

## Request authentication (`AuthGuard`)

- Registered globally in `bootstrap/configure-app.ts` with `app.useGlobalGuards(new AuthGuard(...))`. It is not an `APP_GUARD` provider. A few controllers (`agents`, `events`, `notifications`) also add `@UseGuards(AuthGuard)`.
- Order of checks: paths in `disabledPaths` (prefix match) and `@Public()` pass. A request with the `x-oasm-api-key` header passes only on `/api/mcp*` (`McpGuard` checks the key there). Otherwise `auth.api.getSession` runs. Its refreshed `Set-Cookie` is copied onto the response. `@Optional()` lets a request without a session through. Then `request.session` / `request.user` are set, presence is touched (except while an admin impersonates), and `@Roles` is checked.
- `@Public()` and `@Optional()` are read from the **handler only**, so class-level use does nothing. `@Roles` uses `getAllAndOverride`, so class-level works.
- `@Roles()` with no roles allows everyone, whatever the comment in `app.decorator.ts` says. The role check is skipped when the user has no `role`.
- Roles are `Role.USER`, `Role.ADMIN`, `Role.BOT` (`common/enums/enum.ts`). Workspace permissions are separate; see `modules/workspaces/AGENTS.md`.

## better-auth config facts (`auth.ts`)

- Session cookie name is `session` (httpOnly). better-auth adds `SameSite=Lax`, and `Secure` with a `__Secure-` name prefix when `BASE_URL` is https (or unset under `NODE_ENV=production`), so changing `BASE_URL`'s scheme renames the cookie and signs everyone out. Session model `sessions`, user model `users` with an extra `role` field.
- A client cannot set `role` at sign-up. `user.additionalFields.role` has no `input: false`, but better-auth's `getFields` merges plugin schemas last, so the admin plugin's `role` (`input: false`) wins and a body containing `role` gets a 400. If you drop or reorder the admin plugin, add `input: false` to `additionalFields.role`.
- `disabledPaths`: `AUTH_IGNORE_ROUTERS` (`mcp`), `/admin/remove-user`, `/admin/list-users`, `/admin/get-user`, `/delete-user`, `/delete-user/callback`. Users are never deleted, because `workspaces.ownerId` cascades. Admins ban instead. The listing routes are replaced by `GET /api/admin/users[/:id]`.
- Public sign-up (`/sign-up/email`) is gated by `SignUpHook` (admin module). A `databaseHooks.user.create.before` hook creates HTTP sign-ups banned with `PENDING_APPROVAL_REASON`; approving means unbanning. Server-side calls (no `ctx.request`) skip both, which is how `POST /admin/init` works.
- `autoSignIn: false`. Email verification is sent on sign-up. `MailService` sets `sendVerificationEmail` at boot.
- `hooks: {}` must stay an object: `AuthModule.onModuleInit` chains every `@BeforeHook` / `@AfterHook` method of `@Hook()` providers into it, and skips this when `hooks` is unset. Hooks match on the exact `ctx.path`.
- Rate limit: 100 req / 60 s per client IP and path (better-auth's built-in rules are stricter on `/sign-in`, `/sign-up`, `/change-password`, `/change-email`: 3 per 10 s). It is counted in Redis by `createRateLimitStorage`, one atomic script per request, so all replicas share the budget. While Redis is unreachable each instance counts in memory instead; auth never fails on it. `AUTH_RATE_LIMIT_DISABLED=true` is meant only for the e2e harness.
- `resolveAuthSecret` refuses to boot outside local env when `BETTER_AUTH_SECRET` is missing, shorter than 32 characters, or the public default.
- `trustedOrigins` is `resolveTrustedOrigins()` (`common/config/allowed-origins.ts`: `TRUSTED_ORIGINS`, the `BASE_URL` origin, and `localhost:5173`/`:3000` in local env) plus the request's own `Origin` when the browser sends `Sec-Fetch-Site: same-origin` (`trustedRequestOrigins`). That last part is what lets the console sign in behind nginx, which drops the port from `Host`. better-auth refuses a cookie-carrying POST from any other origin, and a `callbackURL` off those origins. `advanced.disableOriginCheck: false` keeps these checks on under `NODE_ENV=test` too (better-auth skips them there by default), so `test/auth-tenancy.e2e-spec.ts` covers them, and an e2e POST to `/api/auth/*` that carries a cookie must send a trusted `Origin`. The same list is the CORS allow-list in `bootstrap/configure-app.ts` and the storage buckets' CORS (`modules/storage/storage.config.ts`). A bad `TRUSTED_ORIGINS`/`BASE_URL` value (not an http(s) URL, or a wildcard) stops the boot.
- `TRUSTED_PROXIES` feeds client IP resolution for the rate limiter.

## Session cache invariants (`session-storage.ts`)

- The database stays the source of truth (`storeSessionInDatabase: true`). Redis entries live at most `SESSION_CACHE_TTL_SECONDS` (5 min).
- Deleting a token writes a `session:revoked:<token>` marker. A Lua script refuses to re-cache while the marker exists. Keep this when changing revocation.
- `active-sessions-<userId>` is always answered from the database. Verification keys are never cached.
- A Redis failure must never fail auth: reads fall back to the database, and write/delete errors are only logged. The connection uses `enableOfflineQueue: false` and a 500 ms command timeout.

## Data model

- `users`: `email` unique, `role` varchar (default `user`), ban columns from the admin plugin, `language`. Many modules point at `User` with `onDelete: CASCADE`, one-way: `User` declares only the inverse relations something reads (`sessions`, `accounts`, and `workspaceMembers`, which the notifications lane joins). Add one only with a reader, or the entity imports half the modules again.
- `sessions` and `accounts` cascade on user delete. `sessions.impersonatedBy` is a second FK to `users`.
- `UsersService.onModuleInit` (users module) seeds the bot user `BOT_ID`.
- `accounts.password` holds better-auth's hash. Never write it through TypeORM.

## Coupling

- `UserPresenceService` needs the global `RedisService`. `AdminUsersService` reads it.
- `AdminService` uses `AuthService.api` (`signUpEmail`, `signInEmail`). `MailService` injects `AUTH_INSTANCE_KEY` and mutates `auth.options.emailVerification`.
- Hook providers live in `admin/`: `SignUpHook`, `PendingApprovalHook`.
- Importing `auth.ts` (directly, or via `auth.module.ts`) creates a `pg` `Pool` and an ioredis client (from `REDIS_URL`) as a side effect. Unit specs should mock it or import only the pieces they test.

## Testing

Specs: `auth-env.spec.ts`, `auth-logger.spec.ts`, `rate-limit-storage.spec.ts`, `session-storage.spec.ts`, `user-presence.service.spec.ts`. Trusted-origin resolution is in `src/common/config/allowed-origins.spec.ts`. Guard behaviour is in `src/common/guards/auth.guard.spec.ts`. End-to-end sign-up and tenancy are in `test/auth-tenancy.e2e-spec.ts`.
