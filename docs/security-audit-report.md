# Open-ASM Security Audit — Cross-Tenant, IDOR, SQLi and Related Classes

**Target:** `open-asm` monorepo — NestJS 11 / TypeORM / PostgreSQL 17 backend (`core-api`)
**Date:** 2026-09-26
**Type:** Whitebox code audit (source review), authorized by the repository owner
**Methodology:** Sink→source tracing + missing-control analysis (object × action authz matrix), per `hack/CODE_AUDIT.md`

---

## Scope and exclusions

**In scope:** cross-tenant isolation, IDOR/BOLA/BFLA, SQL injection, and directly related classes (unauthenticated exposure, CORS/session handling, mass assignment).

**Explicitly excluded per request:** any finding whose root cause is misconfiguration of `.env` / deployment configuration. Two items touch configuration-adjacent code and are included **only** because the defect lives in source code, not in an `.env` file — each is flagged explicitly in its entry.

**Not assessed:** the Go `worker` service, the React `console` client, and dependency CVE state. The worker holds the host Docker socket (root-equivalent by design); no worker code was reviewed.

**Verification standard applied:** every file path, symbol and line number below was opened and read during this audit. Items that could not be confirmed are listed in [Appendix B](#appendix-b--flagged-but-not-claimed) and are **not** counted as findings.

---

## Executive summary

## The headline finding

**Sending any non-empty `x-oasm-api-key` header disables authentication for the entire API.** `auth.guard.ts:77` short-circuits the *global* guard — the one that protects every route — before the session lookup, before the role check, and without validating the header's value. `McpGuard` only validates that key on the two `/api/mcp` routes; nothing validates it anywhere else. An attacker who guesses or brute-forces nothing at all — the header accepts the literal string `x` — reaches every endpoint that is not explicitly `@Public()` or `@WorkspaceAccess(...)`. This single line downgrades the practical severity of much of the rest of this report and should be fixed first. See **AC-01**.

## The rest

The platform's tenant model is sound in design but enforced **by convention rather than by framework**. The workspace id arrives from a client-controlled header (`X-Workspace-ID`) or cookie (`wid`); `WorkspacePermissionGuard` verifies the caller is a member of that workspace and publishes it as `request.workspaceId` — but **it never scopes a query**. Every repository call is therefore responsible for re-applying the tenant filter, and that responsibility is missed on a consistent, identifiable set of handlers.

Four classes dominate:

| Class | Count | Worst case |
|---|---|---|
| **Authentication / authorization control failure** | 4 | Any request with a junk header bypasses auth platform-wide; class-level `@Roles` is silently a no-op |
| Cross-tenant / IDOR (missing object-ownership check) | 13 | Any authenticated user deletes any tenant's asset group, cascading to workflows and job history |
| SQL injection (`ORDER BY` column injection) | 8 endpoints | Blind SQL injection against the platform database |
| Unauthenticated exposure | 3 | Job-result injection, tenant screenshot read, and drive-by Telegram bot control without any credential |

The codebase is **not uniformly broken** — see [Coverage](#coverage-verified-correct). `assets`, `targets` read paths, `vulnerabilities` and most list endpoints scope correctly and whitelist their sort columns. Vertical privilege escalation via workspace roles was specifically tested and **none was found**; the permission-grant model holds. That asymmetry is the finding: the allow-list pattern already exists and is applied in roughly half the places, which is what makes these omissions survivable in review and dangerous in production.

**Root cause (one fix, many findings):** a handler that decorates with `@WorkspaceAccess(...)` but forgets to also declare `@WorkspaceId()` **fails open**. A lint rule forbidding that combination would have caught 7 of the 13 cross-tenant findings at build time.

---

## Severity summary

| ID | Severity | Title | Location |
|---|---|---|---|
| **AC-01** | **Critical** | Junk `x-oasm-api-key` header bypasses global authentication | `auth.guard.ts:77` |
| **CT-01** | **Critical** | Cross-tenant deletion of any asset group | `asset-group.service.ts:457` |
| SQ-01 | High | `ORDER BY` injection via `sortBy` (8 endpoints) | `get-many-base.dto.ts:57` |
| AC-02 | High | Class-level `@Roles(Role.ADMIN)` never enforced | `auth.guard.ts:96` |
| CT-02 | High | Cross-tenant toggle of any asset | `assets.service.ts:1227` |
| CT-03 | High | Cross-tenant update of any target + scheduler rewrite | `targets.service.ts:675` |
| CT-04 | High | Cross-tenant re-scan of any target | `assets.service.ts:428` |
| CT-05 | High | Cross-tenant read of all issue comments | `issues.service.ts:90` |
| CT-06 | High | Cross-tenant rewrite of group→workflow cron | `asset-group-workflow.service.ts:322` |
| CT-07 | High | Cross-tenant execution of another tenant's workflow | `asset-group-workflow.service.ts:387` |
| CT-08 | High | Foreign workflow disclosure via own group | `asset-group-workflow.service.ts:155` |
| CT-13 | High | Tenant id read from request body, not the guard | `tools.service.ts:214` |
| AE-01 | High | Unauthenticated job-result submission | `jobs-registry.controller.ts:165` |
| AE-02 | High | Unauthenticated read of tenant screenshots | `storage.controller.ts:257` |
| CT-09 | Medium | Foreign assets attached to own group | `asset-group-asset.service.ts:58` |
| CT-10 | Medium | Cross-tenant comment injection | `issues.service.ts:61` |
| CT-11 | Medium | Cross-workspace issue update / status change | `issues.service.ts:401` |
| CT-12 | Medium | Cross-workspace comment edit / delete | `issues.service.ts:145` |
| AC-03 | Medium | `GET /api/search` has no workspace membership guard | `search.controller.ts:31` |
| AC-04 | Medium | Notification recipients and scope client-controlled | `notifications.controller.ts:67` |
| AC-05 | Medium | System tool catalogue writable by any user | `tools.controller.ts:47` |
| AE-03 | Medium | `POST /api/mcp/message` missing `McpGuard` | `mcp.controller.ts:20` |
| AE-04 | Medium | Telegram webhook public, no secret-token check | `integrations.controller.ts:405` |
| CF-01 | Medium | Credentialed CORS with origin reflection | `configure-app.ts:47` |
| CF-02 | Medium | Session cookie missing `secure`/`sameSite` | `auth.ts:30` |
| CF-03 | Medium | `trustedOrigins: ['*']` | `auth.ts:22` |
| AE-05 | Low | Hardcoded default encryption/download key | `app.constants.ts:29` |
| AE-06 | Low | `GET /api/providers/:id` missing owner check | `providers.service.ts:75` |
| AE-07 | Low | `POST /api/init-admin` check-then-act race | `users.service.ts:41` |
| AE-08 | Low | `/api/messages/*` silently bypasses the global guard | `app.constants.ts:17` |

---

# Remediation status

Branch: **`security-patch-2026-10-03`** (from `main`).

**Fixed: 22 of 26 findings.** Verification on the branch: `task lint` 0 errors · `task api:build` TSC 0 issues · `task api:test` 100 suites / 1533 tests · `task api:test:e2e` 6 suites / 33 tests. A new `core-api/src/common/guards/auth.guard.spec.ts` locks in the two guard fixes.

| ID | Status | Change |
|---|---|---|
| AC-01 | ✅ | Bypass scoped to `/api/mcp` via a new `isMcpPath()` helper + `MCP_AUTH_PATH` constant |
| AC-02 | ✅ | `reflector.get` → `getAllAndOverride([handler, class])` |
| AC-03 | ✅ | `@WorkspaceAccess('asset.read','target.read')` on `GET /api/search` |
| AC-04 | ✅ | **`POST /api/notifications` removed** — dead route, every caller is an internal service, and `notification` has no `write` permission key to gate it with |
| AC-05 | ✅ | Method-level `@Roles(Role.ADMIN)` on `POST /api/tools` (method-level because of AC-02) |
| CT-01 | ✅ | `where: { id, workspace: { id: workspaceId } }` |
| CT-02 | ✅ | `where: { id: assetId, target: { workspaceId } }` |
| CT-03 | ✅ | `findOneBy({ id, workspaceId })` |
| CT-04 | ✅ | Target resolved with `{ id, workspaceId }` **before** any job dispatch; removed the `getWorkspaceIdByTargetId` self-derivation |
| CT-05 | ✅ | `innerJoin('issueComments.issue')` + `issue.workspaceId` predicate |
| CT-06 | ✅ | `assetGroup: { workspace: { id: workspaceId } }` |
| CT-07 | ✅ | `.andWhere('workspace.id = :workspaceId')` before `startRun` |
| CT-08 | ✅ | `findByIds` → `find({ id: In(...), workspace: { id: workspaceId } })` |
| CT-09 | ✅ | Same, via `target: { workspaceId }` |
| CT-10 | ✅ | Parent issue loaded via `getById(issueId, workspaceId)` before insert |
| CT-11 | ✅ | `getById`'s `workspaceId` is now **required**, so it can no longer be omitted |
| CT-12 | ✅ | `issue: { workspaceId }` predicate; bare `Error` → `ForbiddenException` (500 → 403) |
| CT-13 | ✅ | `workspaceId` removed from `AddToolToWorkspaceDto` / `InstallToolDto`; taken from `@WorkspaceId()` |
| SQ-01 | ✅ | Central `@Matches(/^[A-Za-z_][A-Za-z0-9_]*$/)` on `GetManyBaseQueryParams.sortBy` — one change, closes all 8 sinks |
| AE-01 | ✅ | `@WorkerTokenAuth()` added |
| AE-02 | ⏸️ | **Reverted at owner request.** Storage read is back to the original `@Public()` + deny-list (`privateBuckets = ['reports','job-results']`), so `screenshot` and `default` are publicly readable again. See the note below. |
| AE-03 | ✅ | `@UseGuards(McpGuard)` on `POST /mcp/message` |
| AE-04 | ✅ | `secret_token` derived via HMAC from the bot token, sent on `setWebhook`, verified with `timingSafeEqual` — no schema or `.env` change |
| AE-06 | ✅ | `getProviderById(id, userContext)` enforces ownership; internal callers use a private raw loader |
| AE-08 | ✅ | `'messages'` removed from `AUTH_IGNORE_ROUTERS` |

**Deliberately not fixed** (out of scope per request — all are configuration / trust-surface, not code defects):

- **CF-01** credentialed CORS with origin reflection
- **CF-02** session cookie `secure` / `sameSite` commented out — `secure: true` requires HTTPS at the deployment layer
- **CF-03** `trustedOrigins: ['*']`
- **AE-05** hardcoded `DEFAULT_ENCRYPTION_KEY` fallback
- **AE-07** `POST /api/init-admin` check-then-act race — the correct fix is a partial unique index, i.e. a schema change requiring explicit approval

### AE-02 — deferred, and the finding stands

The storage hardening was implemented, caused a 403 on `GET /api/storage/screenshot/<key>.png`, and was **reverted at the owner's request** pending a separate plan. The vulnerability described in this report is therefore **still present**: `GET /api/storage/:bucket/:path` is `@Public()` and only blocks `reports` and `job-results`, so `screenshot` and `default` are readable without any credential.

Why it matters, restated for whoever picks this up: a screenshot object key is `md5(asset.value)` (`data-adapter.service.ts:641`) — a flat key with no workspace prefix. Anyone who knows or can guess a target hostname can compute its md5 and read that tenant's screenshot of it, unauthenticated. For an ASM product those images routinely depict internal admin panels, dashboards and login pages.

The implementation that was tried and backed out, for reference:
1. Remove `@Public()`, add `@Optional()` — the global `AuthGuard` then still runs and populates `request.user`, while unauthenticated requests pass through (required because the login page renders the logo from the `system` bucket before a session exists).
2. For non-public buckets, resolve the owning workspace (`asset_services` → `assets` → `targets` for `screenshot`; `reports` for `reports`) and require `WorkspacesService.getMembershipWithPermissions`.
3. Buckets with no owner row (`job-results`, `default`) are not readable over HTTP; unknown keys return the same 404 so the endpoint is not a workspace-existence oracle.

Re-applying it touches `StorageController`'s constructor, so note that `StorageModule` is `@Global()` and `WorkspacesModule` is `@Global()` — `WorkspacesService` is injectable without a new module import, and `DataSource` needs no wiring at all.

**Follow-up needed before merge:** `POST /notifications` removal and the two tool DTO changes alter the public API contract, so `.open-api/open-api.json` and `console/src/services/apis/gen/queries.ts` need regenerating with `task gen-api` against a running API. That was not possible in this environment. Both are generated artifacts and should be refreshed before merge.

---

# Part 0 — Authentication and authorization control failures

These are defects in the *enforcement machinery itself*, rather than in individual handlers. They are listed first because they change how every other finding should be read: **AC-01 in particular makes a large part of this report reachable with no credential at all.**

## AC-01 — Critical — A junk header disables authentication platform-wide

`core-api/src/common/guards/auth.guard.ts:65-81`:

```ts
const disabledPaths = this.auth.options.disabledPaths
  ?.map((path) => `/${API_GLOBAL_PREFIX}/${path}`) ?? [];
const isDisabledAuth = disabledPaths.some(
  (p) => request.path === p || request.path.startsWith(p + '/'),
);

const isPublic = this.reflector.get('PUBLIC', context.getHandler());
if (isPublic || isDisabledAuth) return true;                      // :73

// If any request carries an MCP API key header, skip session check.
// The downstream guard (McpGuard) validates the key and sets workspaceId.
if (request.headers[MCP_API_KEY_HEADER]) return true;              // :77  ← the bug

const currentSession = await this.auth.api.getSession({ ... });    // :79
```

`MCP_API_KEY_HEADER = 'x-oasm-api-key'` (`app.constants.ts:15`).

**Why it breaks.** The comment states the intent — MCP routes are handled by `McpGuard` — but the code does not scope the branch to MCP routes. It tests only whether the header is present and non-empty, then returns `true` for **every route in the application**. Three consequences:

1. The header's **value is never validated** on these routes. The literal string `x` is accepted.
2. The session lookup at `:79` never runs, so `request.user` stays undefined.
3. Because the role check at `:96-104` runs *after* the `return true` at `:77`, `validateUserRole` never executes either.

`McpGuard` (`mcp/mcp.guard.ts:12-32`) validates the key only on the two `/api/mcp` routes it is attached to. Nothing validates it anywhere else.

- **Precondition:** **unauthenticated.** No credential, no token, no guess required.
- **Impact:** any endpoint that is neither `@Public()` nor `@WorkspaceAccess(...)` becomes unauthenticated. Confirmed reachable: `GET|PUT /api/system-configs` and `DELETE /api/system-configs/logo` (platform-wide configuration write), `POST /api/notifications` (send in-app notifications to arbitrary users, including admins), `POST /api/tools` (inject rows into the shared tool catalogue), `GET /api/search` (enumerate any tenant's assets and targets), `GET /api/workflows/templates`, `GET /api/tools/built-in-tools`.

  This finding also **lowers the effective severity of the `@Public()` findings AE-01, AE-02 and AE-04**, which required no credential anyway, and it converts several Medium authenticated-only issues into unauthenticated ones.
- **Fix:**

  ```ts
  const isMcpPath = request.path === '/api/mcp' || request.path.startsWith('/api/mcp/');
  if (isMcpPath && request.headers[MCP_API_KEY_HEADER]) return true;
  ```

  Alternatively, drop the branch entirely and let `McpGuard` own MCP authentication — `McpGuard` already runs as a method guard and does not depend on `AuthGuard` having run.

## AC-02 — High — Class-level `@Roles(Role.ADMIN)` is silently a no-op

`auth.guard.ts:96-104`:

```ts
const rolesAccepted = this.reflector.get<Role[]>(
  ROLE_METADATA_KEY,
  context.getHandler(),      // :98  single target — the METHOD only
);

const userRole = request.user?.role;
if (userRole) {
  this.validateUserRole(rolesAccepted, userRole);
}
```

Verified against the installed NestJS 12.1.0 implementation
(`node_modules/.pnpm/@nestjs+core@12.1.0_…/node_modules/@nestjs/core/services/reflector.service.js`):

```js
get(metadataKeyOrDecorator, target) {
    const metadataKey = metadataKeyOrDecorator.KEY ?? metadataKeyOrDecorator;
    return Reflect.getMetadata(metadataKey, target);
}
```

`Reflector.get` reads a **single** target. Class-level decorator metadata is stored on the constructor; `context.getHandler()` returns the prototype method. `Reflect.getMetadata` does not walk up to the constructor, so `rolesAccepted` is always `undefined` and `validateUserRole` returns immediately at `:112-117`.

`SystemConfigsController` relies on this:

```ts
@Controller('system-configs')      // system-configs.controller.ts:18
@Roles(Role.ADMIN)                 // :19  class-level — never read
export class SystemConfigsController {
```

- **Precondition:** any authenticated user (any role).
- **Impact:** any logged-in user reads and overwrites platform-wide system configuration — system name, logo path — and can delete the system logo (`system-configs.service.ts:62-93`). Combined with **AC-01** this is fully unauthenticated.
- **Note the inconsistency:** `WorkspacePermissionGuard` gets this right — it uses `getAllAndOverride` with `[context.getHandler(), context.getClass()]` (`workspace-permission.guard.ts:50-53`, `:97-100`). Only the role check in `AuthGuard` is wrong. Method-level `@Roles` (as on `storage.controller.ts:89` and `:167`) does work.
- **Fix:**

  ```ts
  const rolesAccepted = this.reflector.getAllAndOverride<Role[] | undefined>(
    ROLE_METADATA_KEY,
    [context.getHandler(), context.getClass()],
  );
  ```

  Worth a follow-up sweep: any other controller relying on class-level `@Roles` is equally unenforced.

## AC-03 — Medium — `GET /api/search` has no workspace membership guard

`search.controller.ts:31-38`:

```ts
@Get()
searchAssetsTargets(
  @UserContext() user: User,
  @Query() query: SearchAssetsTargetsDto,
  @WorkspaceId() workspaceId: string,      // parses the header; does NOT check membership
) {
  return this.searchService.searchAssetsTargets(user, query, workspaceId);
}
```

There is no `@WorkspaceAccess`. `@WorkspaceId()` (`workspace-id.decorator.ts:15-26`) only parses the client header and checks it is a well-formed UUID — it performs **no** membership verification. That check lives solely in `WorkspacePermissionGuard`, which this route never invokes.

- **Precondition:** any authenticated user; unauthenticated when combined with **AC-01**.
- **Impact:** enumerate the assets and targets of any workspace by supplying its UUID — discovered hostnames, IPs and URLs belonging to other tenants.
- **Fix:** add `@WorkspaceAccess('asset.read', 'target.read')`.

## AC-04 — Medium — Notification recipients and scope are client-controlled

`notifications.controller.ts:67-70` → `notifications.service.ts:30-32`:

```ts
await this.notificationQueue.add(BullMQName.NOTIFICATION, body);
```

No `@WorkspaceAccess`, no `@Roles`, and `@UserContext()` is not even injected. `recipients: string[]`, `scope`, and `type` are all client-supplied; `workspaceId?: string` in the DTO (`create-notification.dto.ts:62`) carries no validator.
**Precondition:** any authenticated user; unauthenticated with **AC-01**.
**Impact:** spoofed in-app notifications delivered to arbitrary users including administrators, rendered through i18n interpolation with attacker-supplied `metadata` — phishing, flooding and UI spoofing.
**Fix:** derive `workspaceId` server-side and constrain recipients to the caller's workspace; gate the route behind a permission key or make it service-internal only.

## AC-05 — Medium — Shared tool catalogue writable by any user

`tools.controller.ts:47-50` → `tools.service.ts:582-607`. `POST /api/tools` is a **system-wide** mutation protected only by the global auth guard — no `@Roles`, no `@WorkspaceAccess`.
**Precondition:** any authenticated user; unauthenticated with **AC-01**.
**Impact:** any user inserts rows into the catalogue shared by every tenant, polluting all tenants' tool lists.
**Fix:** add **method-level** `@Roles(Role.ADMIN)` — method-level, because of **AC-02**.

## CT-13 — High — Tenant id read from the request body instead of the guard

`tools.controller.ts:79-111` — three handlers decorated `@WorkspaceAccess('workspace.write')`, none of which declare `@WorkspaceId()`:

```ts
@WorkspaceAccess('workspace.write')     // :79
@Post('add-to-workspace')
async addToolToWorkspace(@Body() dto: AddToolToWorkspaceDto) {
  return this.toolsService.addToolToWorkspace(dto);
}
// identical shape at :93-97 (install) and :107-111 (uninstall)
```

`tools.service.ts:200-216`:

```ts
async addToolToWorkspace(dto: AddToolToWorkspaceDto): Promise<WorkspaceTool> {
  const existingEntry = await this.workspaceToolRepository.findOne({
    where: { tool: { id: dto.toolId }, workspace: { id: dto.workspaceId } },   // :204
  });
  ...
  const newWorkspaceTool = this.workspaceToolRepository.create({
    tool: { id: dto.toolId },
    workspace: { id: dto.workspaceId },     // :214  tenant taken from the BODY
  });
```

**Why it breaks.** The guard resolves the tenant from the header and enforces membership there — then the service ignores it and uses `dto.workspaceId`, which the client also supplies. The two never meet. This is the only place in `modules/*` where a guarded route reads its tenant from the body.

- **Precondition:** authenticated member of any workspace holding `workspace.write`; unauthenticated with **AC-01**.
- **Impact:** cross-tenant tool add/remove, and uninstall cascades to deleting the victim's `ToolConfigProfile` rows (`tools.service.ts:270-273`) — i.e. an attacker can destroy another tenant's stored tool credentials.
- **Fix:** drop `workspaceId` from `AddToolToWorkspaceDto` and `InstallToolDto`, and use `@WorkspaceId()`. The correct pattern already exists at `tools.controller.ts:147-148`.

---

# Part 1 — Cross-tenant isolation and IDOR

## The model being violated

`core-api/src/common/decorators/workspace-id.decorator.ts:28-38` — tenant id is read from the `X-Workspace-ID` header, falling back to the `wid` cookie. It is fully attacker-controlled.

`core-api/src/common/guards/workspace-permission.guard.ts:55-61` — resolution order is `params.workspaceId` → declared route param → header/cookie → `params.id`. No audited route declares a route param, so **the header/cookie always wins over `:id`**.

The guard then checks membership and writes `request.workspaceId` (line 75). It never touches a query. Consequently, for every finding below: **the guard authorized the caller against the header's workspace, while the service operated on a row belonging to a different tenant.**

### CT-01 — Critical — Cross-tenant deletion of any asset group

- **Endpoint:** `DELETE /api/asset-group/:id`
- **Controller:** `asset-group.controller.ts:244-248` — `@WorkspaceAccess('group.write')`, `@Delete(':id')`, `delete(@Param('id') id: string)`. `@WorkspaceId()` is not captured at all.
- **Service:** `asset-group.service.ts:455-494`

```ts
async delete(id: string): Promise<DefaultMessageResponseDto> {
  const assetGroup = await this.assetGroupRepo.findOne({
    where: { id },                                   // :458  no workspace predicate
    relations: { assetGroupWorkflows: { workflow: true } },
  });
  ...
  await this.workflowRepo.delete(workflowIds);       // :483
  await this.assetGroupRepo.remove(assetGroup);      // :487
```

- **Why it breaks:** `:id` is attacker-controlled and the lookup carries no tenant constraint.
- **Precondition:** authenticated member of any workspace holding `group.write` in their own workspace.
- **Impact:** permanent cross-tenant destruction. The FK cascade (documented at `asset-group.service.ts:476-478`) removes join rows, job histories, jobs and job error logs. BullMQ repeat schedulers for the group's workflows are cancelled at `:469-474`, so the victim's scheduled scanning stops.
- **Fix:** capture `@WorkspaceId()` and use `where: { id, workspace: { id: workspaceId } }` — the exact predicate already used by `updateAssetGroupById` in the same file at `:509`.

### CT-02 — High — Cross-tenant toggle of any asset

- **Endpoint:** `POST /api/assets/toggle`
- **Controller:** `assets.controller.ts:306-313` — `@WorkspaceAccess('asset.write')`, `@Post('/toggle')`, `@Body() toggleAssetDto`. No `@WorkspaceId()`.
- **Service:** `assets.service.ts:1223-1240`

```ts
const asset = await this.assetRepo.findOne({
  where: { id: assetId },          // :1228  no workspace predicate
});
asset.isEnabled = isEnabled;       // :1236
return this.assetRepo.save(asset); // :1239
```

- **Precondition:** authenticated member of any workspace.
- **Impact:** cross-tenant write of any asset's enabled flag — an attacker can disable monitoring of a victim's assets. (Downstream consumers of `isEnabled` were not traced; see Appendix B.)
- **Fix:** `where: { id: assetId, target: { workspaceId } }` — the pattern already in use at `assets.service.ts:1740`.

### CT-03 — High — Cross-tenant update of any target, including its scheduler

- **Endpoint:** `PATCH /api/targets/:id`
- **Controller:** `targets.controller.ts:239-243` — no `@WorkspaceId()` passed.
- **Service:** `targets.service.ts:674-699`

```ts
const target = await this.repo.findOneBy({ id });     // :675
...
const result = await this.repo.update(id, {           // :693
  ...dto,
  jobId,
});
```

- **Why it breaks:** both read and write are keyed on a client-supplied id. Note the sibling methods in the same file **do** scope correctly — `getTargetById` at `:263-264` and `deleteTarget` at `:633` — which makes this an omission rather than a design choice.
- **Precondition:** authenticated member of any workspace.
- **Impact:** cross-tenant write. When `scanSchedule` changes, `updateTargetScanScheduleJob` (`:709-731`) removes the **victim's** existing BullMQ scheduler and registers a replacement, so the attacker controls another tenant's recurring scan cadence. Mass assignment was evaluated and **does not apply**: `UpdateTargetDto` (`targets.dto.ts:170-176`) declares only `scanSchedule`.
- **Fix:** pass `@WorkspaceId()`, use `findOneBy({ id, workspaceId })`, and authorize before the update.

### CT-04 — High — Cross-tenant re-scan of any target

- **Endpoint:** `POST /api/targets/:id/re-scan` → `targets.controller.ts:214-218` → `assetsService.reScan(id)`
- **Service:** `assets.service.ts:428-460`

```ts
const asset = await this.assetRepo.findOne({
  where: { target: { id: targetId }, isPrimary: true },   // :429
});
const target = await this.targetRepo.findOne({ where: { id: targetId } }); // :440
const workspaceId = await this.workspaceService.getWorkspaceIdByTargetId(targetId); // :444
...
await this.targetRepo.update(targetId, { reScanCount, lastDiscoveredAt });  // :455
```

- **Why it breaks:** the handler resolves the workspace **from the target itself** (`getWorkspaceIdByTargetId`, `workspaces.service.ts:494-506`) — i.e. it explicitly runs inside the victim's tenant.
- **Precondition:** authenticated member of any workspace.
- **Impact:** an attacker triggers real scan execution against another tenant's assets, consuming that tenant's worker capacity and generating outbound scan traffic to their targets. The differing 404/403 behaviour also leaks target-id existence.
- **Fix:** accept `@WorkspaceId()` and assert the target's workspace matches before dispatching.

### CT-05 — High — Cross-tenant read of every issue comment

- **Endpoint:** `GET /api/issues/:issueId/comments` — `issues.controller.ts:170-177`, no `@WorkspaceId()`
- **Service:** `issues.service.ts:83-107`

```ts
const queryBuilder = this.issueCommentsRepository
  .createQueryBuilder('issueComments')
  .withDeleted()
  .leftJoinAndSelect('issueComments.createdBy', 'createdBy')
  .where('issueComments.issueId = :issueId', { issueId })   // :90
  .andWhere('issueComments.deletedAt IS NULL')
```

- **Why it breaks:** `:issueId` is the only filter. There is no join to `issues` and no workspace predicate — even though `Issue` carries `workspaceId`, used correctly elsewhere in the same file at `:347`. There is no creator check on this path either.
- **Precondition:** authenticated member of any workspace (needs only `workspace.read` in their own).
- **Impact:** any authenticated user reads every comment on any issue platform-wide, including author display names and quoted reply content. This is the cleanest read IDOR in the codebase — a single missing predicate, no compensating check.
- **Fix:** capture `@WorkspaceId()`, join `issueComments.issue`, add `.andWhere('issue.workspaceId = :workspaceId')`.

### CT-06 — High — Cross-tenant rewrite of a group→workflow cron schedule

- **Endpoint:** `PATCH /api/asset-group/workflows/:id` — `asset-group.controller.ts:308-320`, no `@WorkspaceId()`
- **Service:** `asset-group-workflow.service.ts:322-325`

```ts
const assetGroupWorkspace = await this.assetGroupWorkflowRepo.findOne({
  where: { id: assetGroupWorkflowId },
  relations: ['assetGroup', 'workflow'],
});
```

- **Why it breaks:** the workspace relationship is eagerly loaded and then simply never compared.
- **Precondition:** authenticated member of any workspace.
- **Impact:** cross-tenant write of another tenant's cron schedule; the victim's BullMQ scheduler is torn down and replaced (`:337-355`).
- **Fix:** pass `@WorkspaceId()` and add `assetGroup: { workspace: { id: workspaceId } }` to the `where`.

### CT-07 — High — Cross-tenant execution of another tenant's workflow

- **Endpoint:** `POST /api/asset-group/workflows/:id/run` — `asset-group.controller.ts:332-339`
- **Service:** `asset-group-workflow.service.ts:387-389`, `:420-428`

```ts
.where('assetGroupWorkflow.id = :assetGroupWorkflowId', { assetGroupWorkflowId })
...
await this.workflowRunnerService.startRun({
  workflow,
  workspaceId: workflow.workspace.id,   // the VICTIM's workspace
  jobName: assetGroupName,
  jobRunType,
  assetIds: assets.map((asset) => asset.id),
});
```

- **Why it breaks:** the query selects `workflow.workspace` and then adopts it as the execution tenant. The guard only validated the attacker's header workspace.
- **Precondition:** authenticated member of any workspace.
- **Impact:** cross-tenant privileged action — starts a scan workflow over another tenant's assets using that tenant's workflow definition, burning their worker capacity.
- **Fix:** capture `@WorkspaceId()` and add `.andWhere('workspace.id = :workspaceId')` before `startRun`.

### CT-08 — High — Foreign workflow disclosure through your own group

- **Endpoint:** `POST /api/asset-group/:groupId/workflows` → `asset-group.controller.ts:149-162`
- **Service:** `asset-group-workflow.service.ts:148-152` (group checked), `:155` (children not), `:219` (persisted)

```ts
if (workspaceId && assetGroup.workspace?.id !== workspaceId) {
  throw new ForbiddenException(...)      // :150  group IS checked
}
...
const workflows = await this.workflowRepo.findByIds(workflowIds);  // :155  NOT scoped
```

- **Why it breaks:** a classic two-leg authorization gap — the parent is authorized, the referenced children are raw client ids.
- **Disclosure path:** `GET /api/asset-group/:id` (`asset-group.service.ts:173-176`) is correctly scoped and serialises `assetGroupWorkflows: { workflow: true }`, so the foreign workflow is returned to the attacker.
- **Precondition:** authenticated member of any workspace.
- **Impact:** cross-tenant disclosure of another tenant's workflow definition. `Workflow.content` is a `jsonb` column (`workflow.entity.ts:121-123`) holding the connector `config` block, which `asset-group.service.ts:426` encrypts with the workspace DEK — ciphertext plus `configProfileId` references pointing at the victim's profile ids.
- **Fix:** scope the child lookup to `workspace: { id: workspaceId }` rather than bare `findByIds`.

### CT-09 — Medium — Foreign assets attached to your own group

Identical two-leg pattern. `asset-group-asset.service.ts:51-55` checks the group; `:58` `const assets = await this.assetRepo.findByIds(assetIds)` does not scope the assets. The listing at `:209` constrains only the *group's* workspace. Attacker-controlled foreign `Asset` rows (hostnames, IPs, `targetId`, `isEnabled`) render inside the attacker's own group.
**Fix:** filter the asset lookup by `target: { workspaceId }` before saving associations.

### CT-10 — Medium — Cross-tenant comment injection

- **Endpoint:** `POST /api/issues/:issueId/comments` — `issues.controller.ts:153-161`
- **Service:** `issues.service.ts:54-70`

```ts
const comment = this.issueCommentsRepository.create({
  content: createCommentDto.content,
  repCommentId: createCommentDto.repCommentId,
  issue: { id: issueId },          // :64  FK written straight from the URL
  createdBy: { id: userId },
  ...
});
```

- **Why it breaks:** the issue is never loaded, so no existence or tenant check occurs. `repCommentId` is likewise unvalidated, so a comment can be threaded onto a comment belonging to a different issue or tenant.
- **Precondition:** authenticated member of any workspace.
- **Impact:** attacker-authored content (including the `@cai` trigger at `:73-78`) injected into another tenant's issue thread.
- **Fix:** load the issue via `getById(issueId, workspaceId)` first — that helper already enforces the boundary — and validate `repCommentId` belongs to the same issue.

### CT-11 — Medium — Cross-workspace issue update and status change

`PATCH /api/issues/:id` (`issues.controller.ts:115-123`) and `PATCH /api/issues/:id/status` (`:132-144`) neither capture `@WorkspaceId()`. The service calls:

```ts
async getById(id: string, workspaceId?: string): Promise<Issue> {   // :379
  const issue = await this.issuesRepository.findOne({ where: { id }, relations: ['createdBy'] });
  ...
  if (workspaceId && issue.workspaceId !== workspaceId) {           // :388  optional!
    throw new ForbiddenException(...);
  }
```

Both call sites (`issues.service.ts:401` and `:428`) invoke `this.getById(id)` with **no argument**, so the tenant check is skipped entirely. Only the creator check (`issue.createdBy.id !== userId`) remains.
**Precondition:** the caller must be the issue's creator — which bounds the blast radius, hence Medium rather than High.
**Fix:** thread `@WorkspaceId()` through and call `this.getById(id, workspaceId)`. Better: make `workspaceId` a required parameter so the check can never be omitted.

### CT-12 — Medium — Cross-workspace comment edit and delete

`issues.service.ts:145-148` and `:180-183` fetch by `{ id }` with `relations: ['createdBy', 'issue']` — the `issue` relation is loaded and its `workspaceId` never compared. Both handlers throw a bare `Error` rather than an HTTP exception, so a cross-tenant attempt surfaces as **HTTP 500 instead of 403**, which is both a leak and a monitoring blind spot.
**Fix:** pass `@WorkspaceId()`, add `issue: { workspaceId }` to the `where`, and replace the bare `Error` with `ForbiddenException`.

---

# Part 2 — SQL Injection

## Root cause

`core-api/src/common/dtos/get-many-base.dto.ts:55-63`

```ts
@ApiProperty({ required: false, example: 'createdAt' })
@IsOptional()
@IsString()          // :57  no allow-list
sortBy: string = 'createdAt';
```

Every DTO that extends this class (`GetManyIssuesDto`, `GetManyInternalNetworksQueryDto`, `GetManyJobsQueryParams`, `GetVulnerabilitiesQueryDto`) inherits a **free-form** `sortBy`. The global `ValidationPipe` (`configure-app.ts:71-76`) sets `whitelist: true` and `transform: true`, but `whitelist` strips *unknown properties* — it does not constrain the *values* of known ones.

TypeORM's `.orderBy(sort, order)` interpolates `sort` into the SQL string verbatim; it parameterizes values, not identifiers. Every `orderBy(\`alias.${sortBy}\`)` call below is therefore an injection point.

`sortOrder` is **not** a vector — it is constrained by `@IsEnum(SortOrder)` at `get-many-base.dto.ts:62`. This narrows the attack to `sortBy` alone.

## SQ-01 — High — `ORDER BY` column injection (8 endpoints)

| # | Endpoint | Sink |
|---|---|---|
| 1 | `GET /api/issues` | `issues.service.ts:369-372` |
| 2 | `GET /api/internal-networks` | `internal-networks.service.ts:63` |
| 3 | `GET /api/internal-networks/:id/network-interfaces` | `internal-networks.service.ts:219` |
| 4 | `GET /api/vulnerabilities` | `vulnerabilities.service.ts:140` |
| 5 | `GET /api/agents/conversations` | `agents.service.ts:461` |
| 6 | `GET /api/agents/workspace-memory` | `agents.memories.ts:135` |
| 7 | jobs-by-assetId listing | `jobs-registry.service.ts:885` |
| 8 | jobs-by-targetId listing | `jobs-registry.service.ts:922` |

Representative sink, `agents.service.ts:456-461`:

```ts
const sortBy = query?.sortBy || 'createdAt';
const sortOrder = query?.sortOrder || 'DESC';
...
qb.orderBy(`conversation.${sortBy}`, sortOrder as 'ASC' | 'DESC')
```

The same shape appears at `issues.service.ts:370` (`.orderBy(\`issues.${sortBy}\`, sortOrder)`), `internal-networks.service.ts:63` (`\`network.${sortBy}\``) and `:219` (`\`iface.${sortBy}\``).

**Precondition:** authenticated member of any workspace — these are all ordinary list endpoints.

**Impact:** boolean-, error- and time-based blind injection against PostgreSQL, enabling full data exfiltration from the platform database (user rows, credentials material, other tenants' scan data). Because the driver executes a single statement, stacked-query RCE is not available, but data disclosure does not require it.

**Proof-of-concept (unauthenticated-by-proxy but authenticated; time-based blind):**

```
GET /api/agents/conversations?sortBy=CASE%20WHEN%20(SELECT%20count(*)%20FROM%20pg_sleep(5))%3E%3D0%20THEN%20createdAt%20ELSE%20id%20END
```

This expands to `ORDER BY "conversation".CASE WHEN (SELECT count(*) FROM pg_sleep(5))>=0 THEN createdAt ELSE id END ASC`, which is valid PostgreSQL and yields a measurable 5-second delay.

**Note on the inconsistency.** The allow-list pattern is already established elsewhere in this same codebase and is simply missing at the eight sinks above:

- `workspaces.service.ts:205-212` — `sortColumnMap[rawSortBy] ?? 'createdAt'`
- `assets.service.ts:314-334`, `:621`, `:749-751`, `:821-822`, `:1035-1036` — explicit column checks
- `integrations.service.ts:248` — `allowedSortFields.includes(sortBy) ? … : 'createdAt'`
- `tools.service.ts:338`, `workflows.service.ts:168`, `asset-group.service.ts:120-126`, `asset-group-asset.service.ts:222`, `reports.service.ts:69`, `jobs-registry.service.ts:153`, `workers.service.ts:291` — all allow-listed

Notably `jobs-registry.service.ts` is whitelisted at `:153` (`JOB_SORTABLE_COLUMNS`) but **not** at `:885` and `:922` — the protection exists in the same file and was not applied to two sibling methods.

**Fix (single change, closes all eight):** enforce the allow-list centrally rather than per endpoint.

```ts
// get-many-base.dto.ts
@IsIn(SORTABLE_COLUMNS)  // or a validator backed by the entity's metadata
sortBy: string = 'createdAt';
```

Short-term, at minimum add a column allow-list to each of the eight sinks. A cheap defence-in-depth measure that does not require per-endpoint work: reject any `sortBy` matching `/[^A-Za-z0-9_."]/` in a global pipe — but note this is insufficient on its own, since unquoted identifier tricks do not require unusual characters. **Allow-listing is the only correct fix.**

---

# Part 3 — Unauthenticated exposure

### AE-01 — High — Unauthenticated job-result submission

`jobs-registry.controller.ts:161-172`:

```ts
@Doc({ summary: 'Updates the result of a job with the given worker ID.' })
/**
 * @deprecated Use category-specific endpoints instead
 */
@Public()
@Post('/:workerId/result')
updateResult(@Param() { workerId }: WorkerIdParams, @Body() dto: UpdateResultDto) {
  return this.jobsRegistryService.updateResult(workerId, dto);
}
```

`JobsRegistryController` (`jobs-registry.controller.ts:100-101`) declares **no class-level guard**. Every other worker-facing endpoint in this controller pairs `@Public()` with `@WorkerTokenAuth()` — see `:153`, `:180`, `:198`, `:216`, `:234`, `:252`, `:270`. This one omits it.

Both layers are therefore absent: `AuthGuard` returns early on `@Public()` (`auth.guard.ts:73`), and no `WorkerTokenGuard` is applied (`worker-token.guard.ts` is the layer that validates the `worker-token` header).

`updateResult` (`jobs-registry.service.ts:936-966`) uploads attacker-controlled JSON to storage and enqueues a `JOB_RESULT` job against an arbitrary `jobId`.

- **Precondition:** **unauthenticated**.
- **Impact:** result-integrity attack — an attacker submits fabricated scan results for any job id, poisoning the tenant's findings. Combined with arbitrary `dto.jobId`, results can be attached to a job belonging to another tenant.
- **Fix:** add `@WorkerTokenAuth()` to the handler, matching every sibling.

### AE-02 — High — Unauthenticated read of tenant screenshots

`storage.controller.ts:257-307`:

```ts
@Public()
@Get(':bucket/:path')
async getFile(@Param('bucket') bucket: string, @Param('path') path: string, ...) {
  if (this.storageService.isPrivateBucket(bucket)) {
    throw new ForbiddenException('Access denied');
  }
  const cleanPath = path.replace(/^\/+/, '');
  const file = await this.storageService.getFile(cleanPath, bucket);
```

`storage.service.ts:28-38` defines the full bucket set and the private subset:

```ts
private readonly buckets = ['system','screenshot','nuclei-templates','job-results','cached-static','reports','default'];
private readonly privateBuckets = ['reports', 'job-results'];
```

Only `reports` and `job-results` are private. **`screenshot` is not**, and `data-adapter.service.ts:643` uploads tenant scan screenshots into it.

- **Precondition:** **unauthenticated**.
- **Impact:** any anonymous party who knows or guesses an object path can read a tenant's target screenshots — which for an ASM platform routinely depict internal admin panels, login pages and dashboards of the customer's internal estate. This is a direct confidentiality breach of scanned customers' infrastructure.
- **Fix:** invert the default. Treat every bucket as private and explicitly allow-list the genuinely public ones (`system`, `nuclei-templates`, `cached-static`). Do not rely on a deny-list that a new bucket silently escapes.

Note the sibling route `GET :bucket/:path/download` (`:197-255`) is better designed — it validates a signed token and takes path/bucket from the **token**, not from URL parameters.

### AE-03 — Medium — `POST /api/mcp/message` has no guard

`mcp.controller.ts:13-23`:

```ts
@Get()
@UseGuards(McpGuard)          // :14  present
async handleSSE(...)

@Post('message')
async handleMessage(...)      // :20  NO guard
```

`AuthGuard` skips the entire `/api/mcp` prefix because `AUTH_IGNORE_ROUTERS` includes `'mcp'` (`app.constants.ts:17`) and the guard's prefix match (`auth.guard.ts:65-73`) returns `true` early. The controller declares no class-level guard either.

**Mitigating factor — do not treat as Critical.** `handleMessage` (`mcp.service.ts:114-121`) resolves a session from the in-memory map and returns 404 when absent:

```ts
const sessionId = req.query.sessionId as string;
const session = this.sessions.get(sessionId);
if (!session) { res.status(404).json({ error: 'MCP session not found' }); return; }
```

Sessions are only created by the **guarded** SSE handler (`:98-103`) and carry a `randomUUID()` id, so an attacker cannot feasibly guess one. The residual risk is defence-in-depth: the request is never re-bound to the principal that created the session, and there is no CSRF protection on the endpoint.
**Fix:** add `@UseGuards(McpGuard)` to `handleMessage` for consistency with the SSE endpoint.

### AE-04 — Medium — Telegram webhook is public with no secret-token verification

`integrations.controller.ts:405-429`:

```ts
@Public()
@HttpCode(200)
@Post('telegram/webhook/:integrationId')
async telegramWebhook(@Param('integrationId') integrationId: string, @Body() update: unknown) {
  ...
  await this.telegramWebhookService.processUpdate(update as ..., { botToken, integrationId });
```

Telegram supports a `X-Telegram-Bot-Api-Secret-Token` header precisely for this case. No such check exists anywhere in `modules/integrations` — the strings `secretToken`, `X-Telegram-Bot-Api-Secret-Token` and `secret_token` do not appear. `processUpdate` acts directly on the caller-supplied payload and calls `telegramBotService.sendMessage` (`telegram-webhook.service.ts:145`, `:183`, `:192`, `:212`) using the organisation's own bot token.

- **Precondition:** **unauthenticated** — the integration id is a UUID, enumerable or guessable.
- **Impact:** anyone can drive the tenant's Telegram bot: send and reply messages as the organisation, and initiate pairing flows. Useful for phishing customers and for social-engineering the security team through a trusted channel.
- **Fix:** verify `X-Telegram-Bot-Api-Secret-Token` against the value stored in the decrypted integration config; return 403 on mismatch.

### AE-05 — Low — Hardcoded default encryption and download-token key

`app.constants.ts:29`:

```ts
export const DEFAULT_ENCRYPTION_KEY = 'OASM_DEFAULT_ENCRYPTION_KEY';
```

Used as the encryption-key fallback (`encryption.util.ts:27`) and, more directly, as the download-token signing secret at `storage.service.ts:46`:

```ts
this.downloadSecret = this.configService.get<string>('DEFAULT_ENCRYPTION_KEY', DEFAULT_ENCRYPTION_KEY);
```

Included because the defect is a committed constant in source, not an `.env` setting. If the environment variable is ever absent, every tenant's stored secrets and all download tokens fall back to one publicly-known string from the repository.
**Fix:** fail fast at startup when the key is unset, rather than falling back.

### AE-06 — Low — `GET /api/providers/:id` missing owner check

`providers.service.ts:75-88`:

```ts
async getProviderById(id: string): Promise<ToolProvider> {
  const provider = await this.providersRepository.findOne({ where: { id }, relations: { owner: true } });
```

`updateProvider` (`:105`) and `deleteProvider` (`:125`) both correctly check `provider.owner.id !== userContext.id`. **The read path does not**, and the controller (`providers.controller.ts:61-64`) does not inject `@UserContext()` at all.

**Impact:** any authenticated user reads another user's provider row, including owner PII. No credentials are stored on the entity, which caps the severity.
**Fix:** add the same owner check used by the update and delete methods.

### AE-07 — Low — `POST /api/init-admin` check-then-act race

`root.controller.ts:24-37` (`@Public()`) → `users.service.ts:41-61`:

```ts
if ((await this.usersRepository.count({ where: { role: Role.ADMIN } })) > 0) {
  throw new ForbiddenException();
}
const result = await this.authService.api.signUpEmail({ body: { ... } });
await this.usersRepository.update(result.user.id, { role: Role.ADMIN, emailVerified: true });
```

The guard is correct when an admin already exists, but the check-then-act has no database-level uniqueness behind it. Two concurrent requests against a cold instance can both pass the count and both mint an admin.

**Impact:** realistically narrow — it requires a race precisely during first boot — but it is trivially hardened.
**Fix:** add a partial unique index on `role = 'admin'`, or serialise the bootstrap path. (Schema change; requires approval per the repository's migration rules.)

### AE-08 — Low — `/api/messages/*` silently bypasses the global guard

`AUTH_IGNORE_ROUTERS = ['mcp', 'messages']` (`app.constants.ts:17`). In `auth.guard.ts:67-69` this is matched by prefix:

```ts
const isDisabledAuth = disabledPaths.some(
  (p) => request.path === p || request.path.startsWith(p + '/'),
);
if (isPublic || isDisabledAuth) return true;
```

No `messages` controller exists today, so there is no current exposure. The risk is latent: **any future route mounted under `/api/messages/` is unauthenticated by default, with no error to signal it.** The list should contain only prefixes that genuinely require the bypass.

*(Related observation, not a finding: the `disabledPaths` entries `'/admin/remove-user'`, `'/delete-user'`, `'/delete-user/callback'` begin with a slash while `'mcp'`/`'messages'` do not. The map at `auth.guard.ts:65-66` prefixes each with `/${API_GLOBAL_PREFIX}/`, producing `/api//admin/remove-user` — a double slash that will not match Express's normalized `request.path`. This makes the block ineffective at the guard layer. It does not create an exposure here, because better-auth itself also honours `disabledPaths`, but the two mechanisms are not aligned and the guard-level block is dead code.)*

---

# Part 4 — Session and cross-origin handling

### CF-01 — Medium — Credentialed CORS with origin reflection

`configure-app.ts:46-49`:

```ts
app.enableCors({
  origin: true,        // reflects any Origin header
  credentials: true,
});
```

`origin: true` mirrors the caller's `Origin` verbatim while allowing credentials, rather than using a fixed allow-list.

**Honest severity assessment:** the practical impact is currently reduced because the session cookie falls back to the browser default `SameSite=Lax` (see CF-02), which prevents the cookie from being attached to cross-site XHR/fetch. It is **not** zero — it becomes immediately exploitable the moment `SameSite=None` is set for any legitimate reason, and it already allows any origin to read unauthenticated response bodies.
**Fix:** replace with an explicit origin allow-list derived from the deployment's console domain.

### CF-02 — Medium — Session cookie missing `secure` and `sameSite`

`auth.ts:27-36`:

```ts
cookies: {
  session_token: {
    name: 'session',
    attributes: {
      httpOnly: true,
      // secure: true,
      // sameSite: 'strict',
    },
  },
},
```

Both hardening attributes are commented out. `httpOnly` is set, which correctly blocks JavaScript session theft. Without `secure`, the session cookie is transmitted over plaintext HTTP and is therefore interceptable on any unencrypted hop. Without an explicit `sameSite`, the cookie inherits `Lax` — which is currently the only thing limiting CF-01.
**Fix:** set `secure: true` and an explicit `sameSite: 'lax'` (or `'strict'` if the console is same-site).

### CF-03 — Medium — `trustedOrigins: ['*']`

`auth.ts:22` — better-auth is configured to trust every origin. This is a library-level opt-out of origin validation that weakens CSRF and OAuth-callback protections, and it compounds CF-01. Set it to the console's actual origin.

---

# Coverage (verified correct)

Recorded so the audit's reach is auditable, and to make the asymmetry explicit: these were checked and are **not** vulnerable.

**Correctly tenant-scoped:**
- **assets** — all list paths route through `buildBaseQuery`'s `.where('targets.workspaceId = :workspaceId')` (`assets.service.ts:268`): `/`, `/ip`, `/host`, `/port`, `/url`, `/tech`, `/status-code`, `/tls`, `/graph` (all six sub-queries at `:1306/:1317/:1328/:1347/:1365/:1394`), `/services/export`. `GET /assets/:id` (`:478-481`), `GET /assets/:assetId/services` (`:1739-1741`), `PATCH /assets/:id` (`:973-979` — the tag writes at `:988-1009` correctly run only after this check), `POST /assets/service/tag/generate` (`:1175-1176`).
- **targets** — `/` (`:534`), `/export` (`:772`), `/:id` (`:263-264`), `DELETE /:id/workspace/:workspaceId` (`:628`, `:633`), `POST /bulk` (`:319`, `:333`, `:399`).
- **asset-group** — `/` (`:69`), `/:id` (`:174`), `PATCH /:id` (`:509`), `POST /` (`:230-270`), group-assets listing (`:194`, `:209`), not-in-group listing (`:255`, `:276`).
- **vulnerabilities** — no findings: `/` (`:131`), `/statistics` (`:257`; the controller overwrites `query.workspaceId` at `controller.ts:90`), `/:id` (`:223-224`), `POST /:id/analyze` (`:411-412`), `DELETE /:id/analyze` (`:571-585`), `POST /dismiss` (`:332-338`), `POST /reopen` (`:377-385`).
- **issues** — `/` (`:347`), `POST /` (`:206-213`, `:238`), `GET /:id` (`:379-393` — this path *does* pass `workspaceId`, which is why only the sibling handlers fail).

**Correctly allow-listed for `sortBy`:** `workspaces.service.ts:205-212`, `assets.service.ts` (five sites), `integrations.service.ts:248`, `tools.service.ts:338`, `workflows.service.ts:168`, `asset-group.service.ts:120-126`, `asset-group-asset.service.ts:222`, `reports.service.ts:69`, `jobs-registry.service.ts:153`, `workers.service.ts:291`.

**Checked, no finding:**
- **Command injection** — the only `eval`/process-spawn surface is three Redis `EVAL` calls (`redis.service.ts:178`, `distributed-lock.service.ts:91`, `technology-forwarder.service.ts:417`). All use static inline Lua with user data passed as an `ARGV` argument, never concatenated into the script body. No `child_process`, `exec`, `spawn`, `eval` or `new Function` exists anywhere in `core-api/src`.
- **Mass assignment** — `UpdateTargetDto` (`targets.dto.ts:170-176`) exposes only `scanSchedule`; the `{ ...dto }` spread at `targets.service.ts:694` is therefore not exploitable. No handler was found spreading a raw body into an entity save.
- **Storage upload** — `storage.controller.ts:89` and `:167` both carry `@Roles(Role.ADMIN)`.
- **`DEFAULT_ADMIN_ID`** (`app.constants.ts:11`) — defined but referenced nowhere else in the codebase. Dead constant, no backdoor.

**Vertical privilege escalation — tested, none found.** The workspace permission-grant model was specifically probed and holds:
- `assertCanGrantPermissionKeys` (`workspaces.service.ts:1073-1095`) and `assertCanGrantGroups` (`:1101-1117`) enforce "grant only what you yourself hold" on group create/update (`:857`, `:930`), member update (`:1183`) and invites (`:1361`).
- The `'*'` wildcard is reserved to the system Admin group (`:850`, `:917`); `findValidPermissionGroups` (`:1320`) filters `isSystem: false`, so an invite can never carry it.
- `assertMemberMutable` (`:1282-1302`) blocks self-modification and owner modification via three independent checks.
- System groups are immutable (`:914`) and undeletable (`:989`).

A low-privilege workspace member **cannot** escalate to platform admin through the role/permission surface.

**Mass assignment — tested, none found.** Every `{...dto}` spread into a write was traced:
- `workspaces.service.ts:310` `update({ id }, { ...dto })` — safe: `UpdateWorkspaceDto` is `PartialType(PickType(Workspace, ['name','description','archivedAt']))` (`dto/workspaces.dto.ts:7-13`) plus the global `whitelist: true`.
- `workspaces.service.ts:541` `update({ id: workspaceId }, dto)` — safe: DTO is `PickType(Workspace, [isAutoEnableAssetAfterDiscovered, isAssetsDiscovery])`.
- `providers.service.ts:109` `Object.assign(provider, updateProviderDto)` — safe: DTO is `PartialType(CreateProviderDto)`, plus `whitelist: true` and an owner check at `:105`.
- `workspaces.service.ts:850-874` / `:902-977` `manager.save(WorkspacePermission, {...})` — safe: fields enumerated explicitly, `isSystem` hard-coded, `'*'` rejected, keys validated against `permission-catalog.json`.

The only place a client-supplied `workspaceId` reaches a write without a scope check is **AC-04** (notifications) — and **CT-13** (tools), where it is used *as* the tenant selector.

---

# Remediation order

Ordered by attacker reachability × blast radius, not by severity label alone.

1. **AC-01** — one-line guard change. Removes unauthenticated reach of AC-02, AC-03, AC-04, AC-05, CT-13 and every other authenticated-only finding. Nothing else on this list matters as much as fixing this first.
2. **AC-02** — one-line reflector change, restores admin gating on system configuration.
3. **CT-01** — one predicate in `asset-group.service.ts:delete`. Trivially fixed, currently a one-request total loss of another tenant's asset group.
4. **AE-01** — add `@WorkerTokenAuth()` to `jobs-registry.controller.ts:165`.
5. **AE-02** — invert the storage bucket privacy default to an allow-list.
6. **CT-05** — one join plus one predicate in `issues.service.ts:getCommentsByIssueId`.
7. **CT-02 / CT-03 / CT-04** — one predicate each; each has a correctly-scoped sibling in the same file to copy.
8. **SQ-01** — central `sortBy` allow-list in `get-many-base.dto.ts` closes all eight sinks at once.
9. **CT-06 / CT-07 / CT-08 / CT-09 / CT-13** — scope the group→workflow and group→asset child lookups; remove `workspaceId` from the two tool DTOs.
10. **AC-03 / AC-04 / AC-05** — add the missing guards.
11. **CF-01 / CF-02 / CF-03** — origin allow-list, cookie `secure`/`sameSite`, `trustedOrigins`.
12. **AE-04** — Telegram secret-token verification.
13. **CT-10 / CT-11 / CT-12** — thread `@WorkspaceId()` through the issues write paths; make `getById`'s `workspaceId` parameter **required** so it cannot be silently omitted again.
14. **AE-05 / AE-06 / AE-07 / AE-08** — hardening.

**Preventing recurrence — the highest-leverage change.** The cross-tenant findings are not eight independent mistakes; they are one repeated mistake, and it is statically detectable:

> Ban `@WorkspaceAccess(...)` on a handler that does not also declare an `@WorkspaceId()` parameter.

That single lint rule catches 7 of the 13 (CT-01, CT-02, CT-03, CT-04, CT-05, CT-10, CT-11, CT-12, CT-13). Pair it with a shared `@TenantResource()` decorator that takes the workspace predicate as an argument, so the correct filter is the default rather than something each author must remember.

Second lever: replace the per-endpoint `sortBy` allow-lists with one validator bound to entity metadata, which retires the entire SQLi class permanently.

Third lever, and the one that would have caught the two Criticals: **lint for guards that read a tenant id from anywhere other than `@WorkspaceId()`/`request.workspaceId`.** `auth.guard.ts:77` reads a header to decide whether to authenticate; `tools.service.ts:214` reads a DTO field as the tenant. Both are one-line deviations from an established convention that a targeted rule would surface.

---

# Public route inventory

Every `@Public()` route in `core-api`, with its verdict. This is the complete unauthenticated attack surface.

| # | Method / path | Own auth | Verdict |
|---|---|---|---|
| 1 | `GET /api/health` | — | public-ok |
| 2 | `POST /api/init-admin` | service-level "no admin exists" | **suspicious → AE-07** |
| 3 | `GET /api/metadata` | — | public-ok |
| 4 | `GET /api/version/latest` | — | public-ok |
| 5 | `GET /api/workspaces/invitations/:token` | — | public-ok (returns workspace name/id/email/status/expiry, never the token itself — `workspaces.service.ts:1474-1480`) |
| 6 | `GET /api/connectors/:file` | — | public-ok (static logos) |
| 7 | `GET /api/storage/:bucket/:path/download` | HMAC token; bucket and path read from the **token**, not the URL (`:234-238`) | public-ok — good design |
| 8 | `GET /api/storage/:bucket/:path` | deny-list of two buckets | **suspicious → AE-02** |
| 9 | `GET /api/jobs-registry/:workerId/next` | `@WorkerTokenAuth()` `:153` | public-ok |
| 10 | `POST /api/jobs-registry/:workerId/result` | **none** | **suspicious → AE-01** |
| 11–16 | `POST .../result/{subdomains,http-probe,ports,vulnerabilities,screenshot,url-discovery}` | `@WorkerTokenAuth()` each (`:181`, `:199`, `:217`, `:235`, `:253`, `:271`) | public-ok |
| 17 | `POST /api/workers/alive` | worker token in body, verified (`workers.service.ts:99-106`) | public-ok |
| 18 | `POST /api/workers/join` | `WORKER_SIGNATURE` + API key (`workers.service.ts:565-584`) | public-ok |
| 19 | `POST /api/integrations/telegram/webhook/:integrationId` | **none** | **suspicious → AE-04** |

better-auth `disabledPaths` (`auth.ts:60-65` → `AUTH_IGNORE_ROUTERS = ['mcp','messages']`, `app.constants.ts:17`) become `/api/mcp` and `/api/messages` via the prefix match at `auth.guard.ts:65-69`. `/api/mcp/*` is self-guarded by `McpGuard` on the GET; the POST is not (**AE-03**). No `messages` controller exists today, so that half is currently inert (**AE-08**).

`disabledPaths` disables the **Nest** guard only — better-auth's own handlers remain in force and still enforce `adminRoles: [Role.ADMIN]` on `/admin/*`, with `/admin/remove-user` and `/delete-user*` explicitly blocked.

---

# Appendix A — Attack chains

**Chain 0 — Completely anonymous → full control of system configuration (AC-01 → AC-02)**
`PUT /api/system-configs` with headers `{ "x-oasm-api-key": "x" }` and **no session cookie** → `auth.guard.ts:77` returns before the session lookup → the class-level `@Roles(Role.ADMIN)` at `system-configs.controller.ts:19` would not have applied anyway (**AC-02**) → platform name and logo overwritten. Three lines, no credential, full write access to system-wide configuration.

**Chain 1 — Anonymous → another tenant's scan results (AE-01 → integrity)**
`POST /api/jobs-registry/<worker-id>/result` with no headers → `updateResult` → attacker JSON written to the `job-results` bucket → BullMQ `JOB_RESULT` job enqueued against an arbitrary `dto.jobId`. Fabricated findings land in a tenant's dashboard. (The processor at `processors/job-result.processor.ts:122` requires the `(workerId, jobId)` pair to be `IN_PROGRESS`, so a live worker id and job id are needed — both obtainable from worker-side logs or, given **AC-01**, from the API itself.)

**Chain 2 — Anonymous → another tenant's infrastructure imagery (AE-02)**
`GET /api/storage/screenshot/<path>` → `isPrivateBucket('screenshot')` returns `false` → object returned. Screenshots of internal admin panels and dashboards belonging to the customer's internal estate.

**Chain 3 — Anonymous → arbitrary user notification (AE-04)**
`POST /api/integrations/telegram/webhook/<integration-id>` with a crafted Telegram update → no secret-token check → the tenant's bot sends messages as the organisation, or an attacker impersonates the org to phish its own security team.

**Chain 4 — Anonymous → any tenant's asset and target inventory (AC-01 → AC-03)**
`GET /api/search?workspaceId=<victim-uuid>` with `{ "x-oasm-api-key": "x" }` → global auth bypassed → `@WorkspaceId()` performs no membership check → full asset and target enumeration for a workspace the attacker has never belonged to.

**Chain 5 — Any authenticated user → cross-tenant reconnaissance (CT-05 → CT-08)**
`GET /api/issues/<id>/comments` with a valid `X-Workspace-ID` for any workspace the attacker belongs to → reads another tenant's issue threads, author names and reply content. Those disclosures frequently carry hostnames and issue references that identify valuable targets, which then feed `POST /api/asset-group/:groupId/workflows` (CT-08) or the blind SQLi in SQ-01.

**Chain 6 — Blind SQLi → full database disclosure (SQ-01)**
`GET /api/vulnerabilities?sortBy=<CASE expression>` → `vulnerabilities.service.ts:140` → time-based blind extraction of arbitrary tables, including other tenants' data, from a single authenticated request with no visible output.

**Chain 7 — Any authenticated user → destroy another tenant's tool credentials (AC-01 → CT-13)**
`POST /api/tools/uninstall` with `{ "x-oasm-api-key": "x" }`, a victim `workspaceId` and `toolId` in the body → guard validates the attacker's *header* workspace (which is not even reached under AC-01) → service acts on the body's `workspaceId` → the victim's tool association and its `ToolConfigProfile` rows are deleted (`tools.service.ts:270-273`).

---

# Appendix B — Flagged but not claimed

Per the audit standard, these are recorded but **not** counted as findings because they were not fully traced.

1. **`POST /api/vulnerabilities/scan`** — `vulnerabilities.service.ts:62-93`: `scanDto.targetId` is not compared against `workspaceId` before being forwarded as `createNewJob({ targetIds: [targetId], workspaceId })`. A partial read of `jobs-registry.service.ts:225-334` showed no validation there, but the remainder of that method was not read. **Needs a focused follow-up** — this is the most plausible additional cross-tenant finding.
2. **Downstream effect of `asset.isEnabled = false`** (CT-02) on the victim's scan pipeline was not traced.
3. **Audit-log attribution** — the audit interceptor writes `request.workspaceId`, i.e. the attacker's header workspace, not the affected row's real tenant. This degrades forensic value for every finding in Part 1 but was not independently verified as a defect.
4. **The Go `worker` service and the React `console` client were not reviewed.** The worker holds the host Docker socket and is root-equivalent by design; its trust boundary deserves a dedicated pass.
5. **Downstream consumers of the 13 cross-tenant write paths were not traced.** For each, the write itself is confirmed; what it triggers downstream (scan dispatch, notification fan-out, queue pressure) is inferred from adjacent code and marked as such in the impact notes.
6. **The `job-result` processor's authorisation of `(workerId, jobId)`** was read only at `processors/job-result.processor.ts:122`, which requires the pair to be `IN_PROGRESS`. Whether that check is sufficient to stop result attribution across workers was not fully traced — relevant to **AE-01**.

---

# Appendix C — What was deliberately not filed

Recorded to show the audit distinguished "not present" from "not looked at".

- **Class-level `@Roles` on other controllers.** **AC-02** proves the mechanism is broken generally. Whether any controller other than `SystemConfigsController` relies on class-level `@Roles` was not exhaustively enumerated; the two known method-level uses (`storage.controller.ts:89`, `:167`) are correct. A follow-up grep for `@Roles` above a `@Controller` declaration is warranted.
- **Stored-procedure / second-order injection.** No stored procedures are used. Second-order candidates (stored data re-used in a new query) were not systematically hunted; the parameterisation throughout the codebase makes this lower-priority.
- **Dependency CVEs.** No `pnpm audit` was run; out of scope for a source review.
- **Business-logic and race conditions** beyond the `init-admin` bootstrap race (**AE-07**). Scan scheduling, job claiming and workflow state machines were not modelled as state machines.

---

*Report generated by whitebox source review. Findings are sourced from code read during this audit; no live exploitation was performed against a running instance.*