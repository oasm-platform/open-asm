# integrations module

Third-party apps connected to a workspace (notification, ticketing, cloud-provider asset sync, source-code repositories), plus Telegram chat pairing. One `integrations` row per connection; its config is validated by JSON Schema and its secrets are encrypted with the workspace DEK.

## Layout

- `integrations.controller.ts`: all HTTP routes, prefix `integrations`.
- `integrations.service.ts`: CRUD, test, list orgs/repos, enqueue sync; also exports `deriveTelegramWebhookSecret` / `verifyTelegramWebhookSecret`.
- `integrations-sync.service.ts` (`IntegrationSyncService`) + `integration-sync.processor.ts`: cloud-provider asset sync and its BullMQ repeat schedulers.
- `repository-sync.service.ts` + `repository-sync.processor.ts` + `repository-sync.plan.ts` (pure): GIT_ORG target → repository assets.
- `capabilities.ts`: the capability model (`resolveCapabilities`, `hasCapability`, `normalizeCapabilities`, `isMultiCapabilityApp`).
- `schemas/`: one JSON Schema per app, joined in `universal-integration.schema.ts` (`oneOf`). Each schema file also calls `registerConnector(appType, Class)`. `capability-fields.ts` holds the `x-capabilities` / `ui:capability` helpers.
- `validators/integration.validator.ts`: Ajv validation, encrypt/decrypt/mask of sensitive fields, `restoreMaskedSecrets`.
- `connectors/`: plain (non-DI) connector classes. `connector.abstract.ts` (capability interfaces, `CloudProviderSyncConfig`), `connector.registry.ts`, `connector.factory.ts` (`runConnector`, `testConnectorConnection`, `resolveSourceCodeConnector`). Apps: `aws.connector.ts` + `aws/` (credentials, discovery, `AwsSsoService`), `cloudflare`, `vercel`, `github`/`gitlab` (+ `source-code.http.ts`), `slack`, `discord`, `telegram`, `webhook`.
- `telegram-*.service.ts`: pairing (`TelegramConnectService`), update/command handling (`TelegramWebhookService`), dev long-polling (`TelegramPollingService`), Bot API wrapper (`TelegramBotService`).
- `entities/`: `Integration`, `TelegramConnect`.

## Public surface

| Route | Permission |
|---|---|
| `GET integrations/schemas`, `GET integrations`, `GET integrations/:id` | `integration.read` |
| `GET integrations/:id/organizations`, `GET integrations/:id/repositories` | `integration.read` (SOURCE_CODE only, live provider call, nothing cached) |
| `POST integrations`, `PATCH/DELETE integrations/:id` | `integration.write` |
| `POST integrations/:id/test`, `POST integrations/:id/sync` | `integration.write` |
| `POST integrations/aws/sso/{device,poll,complete}` | `integration.write` (`complete` creates the AWS integration) |
| `POST integrations/:id/telegram/pairing`, `DELETE integrations/:id/telegram/connects/:connectId` | `integration.write` |
| `GET integrations/:id/telegram/connects` | `integration.read` (caller's own connects only) |
| `POST integrations/telegram/webhook/:integrationId` | `@Public()`; requires header `x-telegram-bot-api-secret-token` |

- Events published with `@PublishEvent` on the controller: `integration.connected` (create and `aws/sso/complete`), `integration.settings.updated`, `integration.disconnected`. The catalog also has `integration.sync.*` and `integration.ticket.created`, but nothing publishes them today.
- Events consumed (`@OnEvent`, in-process `EventEmitter2`): `target.git_org.create`, `target.git_org.re-scan` → enqueue repository sync. Emits `target.git_org.synced` when a sync finishes.
- Queues: `BullMQName.INTEGRATION_SYNC_SCHEDULE` (`integration-sync-schedule`, `removeOnFail`) and `BullMQName.REPOSITORY_SYNC` (`repository-sync`). Payloads are `{ integrationId, workspaceId }` and `{ targetId, workspaceId }`.
- Exports `IntegrationsService` and `TelegramConnectService`.

## Data model

- `integrations`: `appType` (schema `$id`, e.g. `aws`, `github`), `category` (primary capability, NOT NULL), `capabilities text[]` (default `{}`), `config jsonb`, `workspaceId` (CASCADE on workspace delete), `createdById` (SET NULL), `syncSchedule` (cron or `'disabled'`), `syncJobId` (BullMQ repeat key), `lastRunAt`. Hard delete, no soft delete.
- `telegram_connects`: one row per pairing. `connectToken` is unique, `tokenExpiredAt` = now + 10 min, `status` PENDING → CONNECTED. CASCADE on integration and on user delete. Rows are hard-deleted on disconnect.
- `targets.integrationId` (owned by the targets module) points here with `ON DELETE SET NULL`. Deleting an integration keeps GIT_ORG targets and pauses their sync.

## Invariants

- **Always read capabilities through `resolveCapabilities` / `hasCapability`.** An empty array means `[category]` (legacy rows). Queries match `category = X OR X = ANY(capabilities)`. Never branch on `integration.category === X`.
- Legacy apps have exactly one capability, their schema's `category.const`. Multi-capability apps (GitHub, GitLab) declare `x-capabilities`, and `normalizeCapabilities` keeps `category` inside the enabled set.
- `app_type`, `category` and `capabilities` are injected into config only for validation and are stripped (`omitDiscriminatorFields`) before storage. `capabilities` is injected only for multi-capability schemas, because legacy schemas are `additionalProperties: false`.
- **Sensitive fields are defined by name across all schemas**: any property with `ui:widget: 'password'` in any app adds that key to `SENSITIVE_FIELDS`, and that key is then encrypted and masked for every app. Responses mask it as `****` + last 4 characters. `updateIntegration` passes incoming config through `restoreMaskedSecrets`, so a round-tripped mask keeps the stored secret.
- Decryption falls back to returning the value as-is (old plaintext rows). `encryptSensitiveConfigFields` uses the KEK when the workspace has no DEK.
- `syncSchedule` other than `'disabled'` is allowed only with CLOUD_PROVIDER (create, update, `runSync`, and the boot backfill all check this). AWS `connectionMethod: 'workloadIdentity'` can never have a schedule (`assertAwsWorkloadIdentityScheduleAllowed`, re-checked in `runSync`).
- Scheduler lifecycle (`IntegrationSyncService`): the repeat job's name is the integration id, and the scheduler is removed by the persisted `syncJobId`, never by the raw id. `onModuleInit` re-adds schedulers for rows with a schedule but no `syncJobId`. A manual sync uses `jobId = manual-sync-<id>`, so a second POST while the first is pending returns the same job.
- One sync per integration at a time: `@Lock('integration-sync:<id>')` with a 30-minute TTL. A held lock returns zero counts, except in dry run, where it throws so `test` reports failure.
- `POST :id/test`: CLOUD_PROVIDER runs `runSync({ dryRun: true })` (no DB writes, no `lastRunAt`). NOTIFICATION sends a real message. Everything else calls `connector.testConnection`. Connector failures come back as `success: false`, not as an HTTP error.
- Scheduled syncs run as the workspace owner, falling back to `createdById` (`resolveActingUser`).
- Repository sync: assets are matched by `metadata.remoteId`, then by value. Missing repositories are **disabled, never deleted**, and nothing is disabled when the listing was truncated (100 pages × 100, or the 10-minute budget). Writes happen in one transaction ordered renames → updates → inserts → disables to satisfy the `(value, targetId)` unique constraint.
- Telegram webhook: the secret is derived as HMAC-SHA256 of the bot token (`deriveTelegramWebhookSecret`), not stored. `setWebhook` runs only when `BASE_URL` is set; otherwise `TelegramPollingService` long-polls every Telegram integration under `@Lock('telegram:poll:<id>')`.

## Coupling

- `IntegrationsService` ↔ `IntegrationSyncService` form a cycle inside the module (`forwardRef` + `WrapperType` on both sides).
- Uses global providers without importing their modules: `TargetsService` (`TargetsModule` is `@Global`), `DataAdapterService`, `WorkspacesService`, `WorkspaceEncryptionService`, `EventBridgeService`. Cloud connectors receive `targetsService` / `dataAdapterService` through `CloudProviderSyncConfig` (type-only imports, no DI).
- Writes other modules' tables directly: `RepositorySyncService` writes `assets` and `targets.lastDiscoveredAt` through its own repositories (`Target` and `Asset` are registered in `forFeature`).
- Imported by `event-bridge` (the integrations sink calls `getIntegrationEntitiesByCapability`, `runConnector` and `decryptSensitiveConfigFields` to push notifications and tickets) and by `jobs-registry` (`getIntegrationWithDecryptedConfig` to put the repository `apiToken` into connector inputs).
- `targets.service.ts` imports `hasCapability`, `sourceCodeHost` and the `Integration` entity to validate GIT_ORG targets. `auth/entities/user.entity.ts` references `TelegramConnect`.
- `projects/dto/cron-schedule.validator` provides `@IsCronSchedule` for the DTOs.

## Gotchas

- **Connectors register as an import side effect** of their schema file. A new app needs its schema added to `universalIntegrationSchema.oneOf` and a `registerConnector` call there. `registerConnector` keeps the **first** registration (the comment says "last wins", but the code does not).
- `jira` has a schema (`isAvailable: false`, a UI hint only) but no registered connector, so the API accepts it while `runConnector` returns "No connector registered". `linearSchema` is commented out.
- `getDecryptedIntegrationById` has no workspace check. Only the public Telegram webhook and Telegram pairing paths use it.
- `TelegramConnector` reads `telegram_connects` through a static repository set in `TelegramConnectService.onModuleInit`. Outside a booted module, `push` throws "not initialised".
- Telegram pairing looks up the PENDING row by token only. It does not check that the token belongs to the bot that received `/pair`.
- The `webhook`, `slack` and `discord` connectors POST to user-supplied URLs with no private-address guard.
- `applySchedule` saves the entity itself, so in `updateIntegration` the pending name/config changes are persisted before the final `save`.

## Testing

Specs are colocated: `integrations.service.spec.ts`, `integrations.controller.spec.ts` (asserts the permission of every route), `integrations.controller.audit.spec.ts` (`@PublishEvent` wiring), `integration-sync.{service,processor}.spec.ts`, `repository-sync.{plan,service}.spec.ts`, `capabilities.spec.ts`, `dto/integration-schedule.dto.spec.ts`, `schemas/{aws,vercel}.schema.spec.ts`, plus per-connector specs in `connectors/` (including AWS/Cloudflare/Vercel ingestion). `vercel-e2e.spec.ts` wires the real sync service → factory → connector with `fetch` mocked, so no network is needed. GitHub/GitLab are covered together in `connectors/source-code.{connectors,owners}.spec.ts`. The four `telegram-*.service.ts` files have no specs.
