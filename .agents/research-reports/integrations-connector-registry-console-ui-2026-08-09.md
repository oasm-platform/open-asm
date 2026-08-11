# Research Report: Integrations Connector Registry + Console UI (prep for Cloudflare CLOUD_PROVIDER)

## Meta
- Date: 2026-08-09. Read-only research, no files modified.
- Question: map connector registry + console integration UI to prepare a Cloudflare CLOUD_PROVIDER integration.
- Sources: repo files (T2) only; no web sources needed.

## 1. Connector registration (schemas)

Both active schemas register at import time via `registerConnector`, and carry a `connector` field on the schema object:

- `core-api/src/modules/integrations/schemas/slack.schema.ts:8` — `registerConnector('slack', SlackConnector);`
- `core-api/src/modules/integrations/schemas/slack.schema.ts:16` — `connector: SlackConnector,`
- `core-api/src/modules/integrations/schemas/telegram.schema.ts:8` — `registerConnector('telegram', TelegramConnector);`
- `core-api/src/modules/integrations/schemas/telegram.schema.ts:16` — `connector: TelegramConnector,`
- Same pattern in `webhook.schema.ts:8` / `webhook.schema.ts:16`.

Registry: `connectors/connector.registry.ts:13-23` — module-level `Map<string, new () => BaseConnector>`; `registerConnector` silently keeps first registration (`registry.has` guard). Factory `connectors/connector.factory.ts:24-28` maps category→method: `NOTIFICATION→push`, `CLOUD_PROVIDER→syncAssets`, `TICKETING→createTicket`; `runConnector` (factory.ts:43-112) resolves class by appType, dispatches by category, no DI.

`cloudflare.schema.ts` has **neither** `connector` field **nor** `registerConnector` call — it's a pure JSON Schema (`cloudflare.schema.ts:7-27`). Registration is driven by module import: `universal-integration.schema.ts:1-5` imports all schema files, so any schema added to the `oneOf` (line 22-32) gets imported and its top-level `registerConnector` side effect runs. Cloudflare is already in the union (`universal-integration.schema.ts:23`).

## 2. isAvailable consumption

Backend: **never consumed** — only defined. `integrations.service.ts:84-86` returns the raw schema; `integrations.controller.ts:48-52` serves it. The Ajv validator (`validators/integration.validator.ts:55-90`) does not filter on it; create/update accept unavailable appTypes. (The `isAvailable` hits in `agents.service.ts:97,104` and `console/.../queries.ts:1717-1723` are `AgentModeDto` — unrelated.)

Set in: `slack.schema.ts:19`, `telegram.schema.ts:19`, `webhook.schema.ts:19` (`true`); `jira.schema.ts:12`, `cloudflare.schema.ts:11` (`false`).

Console: **yes, filtered** —
- `console/src/pages/integrations/index.tsx:92-95` — sort: unavailable pushed last.
- `console/src/pages/integrations/index.tsx:134-138` — `if (appSchema.isAvailable === false) return;` (click guard).
- `console/src/pages/integrations/components/app-card.tsx:13` — `const available = appSchema.isAvailable !== false;` → line 18 `disabled={!available}`, lines 38-42 "Coming soon" badge, line 22 `opacity-50`.

So Cloudflare already renders as a disabled "Coming soon" card today; flipping `isAvailable: true` activates it with no console change.

## 3. Files in core-api/src/modules/integrations/

| File | Purpose |
|---|---|
| `integrations.module.ts` | Nest module; TypeORM `[Integration, TelegramConnect, User]`; providers incl. Telegram services |
| `integrations.controller.ts` | REST: GET schemas, POST /, GET /, GET/PATCH/DELETE /:id, POST /:id/test, Telegram pairing/webhook/connects |
| `integrations.service.ts` | CRUD + test; DEK encrypt/decrypt/mask; notification toggle defaulting; telegram webhook autoconfig |
| `telegram-connect.service.ts` | Pairing tokens (`/start <token>`), chat connections CRUD |
| `telegram-webhook.service.ts` | Parses Telegram updates, binds `/start` token to chat |
| `telegram-polling.service.ts` | Fallback long-polling (Redis lock, 3s interval) when BASE_URL unset |
| `telegram-bot.service.ts` | Cached `node-telegram-bot-api` send-only client per token |
| `connectors/connector.abstract.ts` | `BaseConnector` + `NotificationConnector.push` / `CloudProviderConnector.syncAssets` / `TicketingConnector.createTicket` |
| `connectors/connector.registry.ts` | appType→ctor Map; `registerConnector`/`getConnectorClass` |
| `connectors/connector.factory.ts` | `runConnector` — category→method dispatch, lifecycle hooks |
| `connectors/slack.connector.ts` | Slack push via incoming webhook (`NotificationConnector`) |
| `connectors/telegram.connector.ts` | Telegram sendMessage via Bot API (`NotificationConnector`) |
| `connectors/webhook.connector.ts` | Generic HTTP POST webhook push (`NotificationConnector`) |
| `dto/create-integration.dto.ts` | POST body: name, description?, appType, category, config |
| `dto/get-integration.dto.ts` | Response: id, name, description?, appType, category, config, workspaceId, createdById, createdAt, updatedAt |
| `dto/update-integration.dto.ts` | PATCH: name?, description?, config? |
| `dto/test-integration.dto.ts` | POST /:id/test body: text? |
| `dto/get-many-integrations.dto.ts` | Pagination + appType/category/search filters |
| `dto/schemas-response.dto.ts` | `{ schema }` wrapper |
| `dto/telegram-connect.dto.ts`, `dto/create-telegram-pairing.dto.ts` | Telegram pairing payloads |
| `entities/integration.entity.ts` | Table `integrations`; name/appType/category/config(jsonb)/workspaceId/createdById + telegramConnects. **No schedule/lastRun columns** |
| `entities/telegram-connect.entity.ts` | Table `telegram_connects` |
| `schemas/universal-integration.schema.ts` | oneOf union (Draft 2020-12); cloudflare/jira/slack/telegram/webhook active, github/linear commented |
| `schemas/slack.schema.ts` / `telegram.schema.ts` / `webhook.schema.ts` | Active schemas (registerConnector + connector field) |
| `schemas/cloudflare.schema.ts` | CLOUD_PROVIDER schema, isAvailable:false, no connector |
| `schemas/jira.schema.ts` | TICKETING schema, isAvailable:false, no connector |
| `schemas/github.schema.ts` / `linear.schema.ts` | Drafts, excluded from union |
| `schemas/notification-type.schema.ts` / `severity.schema.ts` | Shared property fragments (toggle keys, ui:form:group, colors) |
| `schemas/index.ts` | Barrel — exports jira/slack/telegram/webhook/universal + fragments; **does not export cloudflare** |
| `validators/integration.validator.ts` | Ajv validate; sensitive-field (ui:widget:password) encrypt/mask/decrypt |

**Connector classes registered today: exactly 3 appTypes — `slack`, `telegram`, `webhook`** (`registerConnector` grep hits only slack/telegram/webhook schema files). Confirmed: **no cloudflare or aws connector class file** — `connectors/` contains only factory, abstract, registry, slack, telegram, webhook. `CloudProviderConnector` base class exists (`connector.abstract.ts:80-89`, abstract `syncAssets`) and factory already maps `CLOUD_PROVIDER→syncAssets` — but no subclass implements it.

## 4. Console integrations UI

Files in `console/src/pages/integrations/`: `index.tsx`; `components/` = `app-card.tsx`, `apps-tab-content.tsx`, `connected-card.tsx`, `connected-tab-content.tsx`, `connect-integration-sheet.tsx`, `integration-detail-sheet.tsx`, `integration-logo.tsx`, `telegram-connect.tsx`.

- (a) Card: `apps-tab-content.tsx:76-83` → `app-card.tsx` (Apps tab; disabled state + "Coming soon" for `isAvailable === false`). Connected list: `connected-tab-content.tsx:35-43` → `connected-card.tsx`.
- (b) Detail sheet: `integration-detail-sheet.tsx` (rendered from `index.tsx:202-211`, matched by `schema.$id === integration.appType`, `index.tsx:124-125`). Read-only view + Edit mode + Test button.
- (c) Create form: `connect-integration-sheet.tsx` (`index.tsx:194-200`). Submit → `useIntegrationsControllerCreateIntegration` → POST `/api/integrations` (queries.ts:25799-25806).
- (d) Test button: `integration-detail-sheet.tsx:577-591` → `useIntegrationsControllerTestIntegration` → **POST `/api/integrations/{id}/test`** (queries.ts:26620-26636; backend `integrations.controller.ts:167-175` → `runConnector`). For CLOUD_PROVIDER this would invoke `syncAssets`.
- (e) Schedule/sync UI: **none** — grep for `schedule|Schedule|cron|Cron|lastRun|syncNow` in `pages/integrations` = zero hits. No schedule field on entity/DTO either. (`components/ui/cron-schedule-builder.tsx` + `components/scan-schedule-select.tsx` exist for *scan* targets — reusable precedent, not integration-scoped.)
- Schema-form renderer: **custom, no react-jsonschema-form**. `connect-integration-sheet.tsx` — `renderField` (64-157) handles boolean→Switch, password/uri/textarea/number/array→Input; `ui:form:group` grouping (272-289) renders toggle grid; array → `ArrayField` (160-234). `integration-detail-sheet.tsx` duplicates the renderer (128-229) with read-only mode. Schema fetch: `useIntegrationsControllerGetSchemas` → **GET `/api/integrations/schemas`** (queries.ts:25645-25656), called at `index.tsx:72`; `rawSchema.schema.oneOf` iterated (`index.tsx:91-95`). Form renderers are pure schema-driven — a new schema needs zero console changes to render.

## 5. GetIntegrationDto fields the console actually reads

Type: `queries.ts:2216-2228` (`id, name, description?, appType, category, config, workspaceId, createdById, createdAt, updatedAt`).

Used:
- `id` — detail/test/delete (index.tsx:188, detail-sheet.tsx:353,382)
- `name` — connected-card.tsx:53, detail-sheet.tsx:371
- `category` — connected-card.tsx:56, detail-sheet.tsx:379
- `appType` — logo URLs (connected-card.tsx:50, detail-sheet.tsx:370), telegram check (detail-sheet.tsx:533)
- `config` — detail read/edit (detail-sheet.tsx:315, 538)
- `createdAt` — "Connected X ago" + sort (connected-card.tsx:60, connected-tab-content.tsx:30)
- top-level `data`/`total` — index.tsx:121-122

Unused by the UI: `description`, `workspaceId`, `createdById`, `updatedAt`.

## 6. Spec files

**None.** Glob `core-api/src/modules/integrations/**/*.spec.ts` → 0 files. The module has no test coverage.

## 7. Git history

- `git log --oneline --all -20 | grep -iE "cloudflare|aws"` → **no output**. No cloudflare/aws commit exists.
- `git log --oneline --all -- core-api/src/modules/integrations | head -20` → telegram command framework, envelope encryption, bot pairing, config editing (`c5f944ea` PATCH endpoint), card refactor, welcome message. Nothing cloudflare/aws.

## Files to touch for Cloudflare

Register connector (1):
- **New**: `core-api/src/modules/integrations/connectors/cloudflare.connector.ts` — `class CloudflareConnector extends CloudProviderConnector` implementing `syncAssets` (connector.abstract.ts:80-89; factory already dispatches CLOUD_PROVIDER→syncAssets).
- `core-api/src/modules/integrations/schemas/cloudflare.schema.ts` — add `connector: CloudflareConnector` field + top-level `registerConnector('cloudflare', CloudflareConnector);` (mirror slack.schema.ts:8,16). Already in the oneOf union (universal-integration.schema.ts:23), so the import-time registration will fire.

Flip isAvailable (2):
- `core-api/src/modules/integrations/schemas/cloudflare.schema.ts:11` — `isAvailable: false` → `true`. No other file needed: console already renders it (app-card disabled state flips off automatically).

Schedule selector + sync-now + last-run (3) — **no existing infrastructure; all new**:
- `core-api/src/modules/integrations/entities/integration.entity.ts` — add `schedule` (cron) + `lastSyncAt`/`lastRun` columns (+ migration via `task migration:generate`).
- `core-api/src/modules/integrations/dto/get-integration.dto.ts` — expose the new fields; `create-integration.dto.ts` / `update-integration.dto.ts` accept schedule.
- `core-api/src/modules/integrations/schemas/cloudflare.schema.ts` — optionally express schedule via schema properties (custom `ui:widget`), or handle in DTO.
- `core-api/src/modules/integrations/integrations.service.ts` — `toResponse` mapping (395-428), schedule persistence, and a sync-now path (new controller endpoint or reuse POST /:id/test semantics; today test → `runConnector` which already calls `syncAssets`).
- `core-api/src/modules/integrations/integrations.controller.ts` — e.g. POST `/:id/sync` if separate from test.
- Scheduler side: none exists for integrations — either a new cron job (BullMQ is already in the stack; Redis locks precedent in telegram-polling.service.ts) or poll-on-demand; out of scope of registry work.
- `console/src/pages/integrations/components/connect-integration-sheet.tsx` — schedule selector in create form (reuse `components/ui/cron-schedule-builder.tsx` / `components/scan-schedule-select.tsx` precedent).
- `console/src/pages/integrations/components/integration-detail-sheet.tsx` — sync-now button + last-run display (and edit-mode schedule).
- `console/src/pages/integrations/components/connected-card.tsx` — optional last-run line.
- Regenerate console API client: `task gen-api` after DTO/controller changes.

## Open questions
- Where synced assets should land (asset groups? inventory?) — no consumer of `syncAssets` output exists anywhere; only the factory dispatch (connector.factory.ts:26).
- Scheduler mechanism for periodic sync (BullMQ job vs in-process cron) — not present today.
- Whether `description`/`updatedAt` should be surfaced in UI (currently unused).
