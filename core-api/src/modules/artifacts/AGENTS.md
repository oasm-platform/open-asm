# artifacts module

Workspace files ("Files" in the console): objects in the `artifacts` bucket, their sharing, personal folders, and the per-workspace storage quota.

## Layout

- `artifacts.service.ts`: `ArtifactsService` (upload lifecycle, read checks, sharing, purge) and constants `ARTIFACTS_BUCKET`, `TEMPLATES_FOLDER_NAME`, `TEMPLATE_NAME_RE`, `PENDING_UPLOAD_TTL_SECONDS`, `PENDING_PURGE_GRACE_MS`, `toObjectKey`.
- `artifact-quota.service.ts`: `ArtifactQuotaService`, sole writer of `workspace_storage_usage`.
- `artifact-folders.service.ts`: `ArtifactFoldersService` (personal folders, the shared templates folder).
- `artifact-sweep.service.ts`: `@Cron('*/5 * * * *')` + `@Lock('cron:artifacts-sweep')` calling `purgeStale()`.
- Controllers: `artifacts.controller.ts`, `artifact-folders.controller.ts`, `public-artifacts.controller.ts`.
- `entities/`: `Artifact`, `ArtifactShare`, `ArtifactFolder`, `WorkspaceStorageUsage`, `bigintTransformer`.

## Public surface

| Route | Permission |
|---|---|
| `GET artifacts` (`scope` mine/shared/all) | `artifact.read`; `scope=all` also needs `artifact.manage` (checked in service) |
| `GET artifacts/usage` | `artifact.read` |
| `GET artifacts/:id`, `GET artifacts/:id/download` | `artifact.read` + `canRead` (managers see metadata, not content) |
| `PATCH artifacts/:id` (name, shareType, parentFolderId) | `artifact.write`, owner only |
| `DELETE artifacts/:id` | `artifact.read` on the route; service requires owner + `artifact.write`, or `artifact.manage` |
| `GET/POST artifacts/:id/shares`, `DELETE artifacts/:id/shares/:userId` | `artifact.write`, owner only |
| `GET artifact-folders`, `GET artifact-folders/:id` | `artifact.read` |
| `GET public/artifacts/:id` | `@Public()`, redirects to a 5-minute URL; 404 unless ready and `public` |

- Registered in `combine.module.ts`. Exports `ArtifactsService`, `ArtifactFoldersService`, `ArtifactQuotaService`.
- There is no upload route here. Uploads come from `projects/project-files.service.ts` (`presignUpload` / `completeUpload`), the agent tool `save_file` in `agents/tools/artifact.tools.ts` (`createFromBuffer`), and `templates` (`createFromBuffer`, `replaceContent`).
- Events: `@PublishEvent` on download, update, delete, share, unshare (`EVENT_CATALOG.artifact.*`); `artifact.created` is published from the service (`publishCreated`), actor type `Agent` unless the caller passes one. `storage.quota.updated` comes from `admin/workspaces` (`PATCH admin/workspaces/:id/storage-quota` → `setQuota`).

## Data model

- `artifacts`: `workspaceId` (CASCADE), `createdByUserId` (SET NULL), `parentFolderId` (NO ACTION), `source` (`upload`/`agent`/`template`), `bucket` + `objectKey` UNIQUE, `sizeBytes` bigint (mapped to number), `shareType` (`private`/`shared`/`public`), `status` (`pending`/`ready`/`deleted`), `metadata` jsonb, `expiresAt`. No TypeORM soft delete: `deleted` is a status.
- `artifact_shares`: unique `(artifactId, userId)`, both FKs CASCADE.
- `artifact_folders`: tree via `parentFolderId` (NO ACTION), `createdByUserId` null only for the workspace templates folder.
- `workspace_storage_usage`: PK `workspaceId`, `usedBytes`, `reservedBytes`, nullable `quotaBytes` (null = `ARTIFACT_WORKSPACE_QUOTA_BYTES`, 1 GiB), CHECKs keep all three non-negative. Created lazily on first reservation.
- `project_artifacts` (projects module) references `artifacts`.

## Invariants

- **Lifecycle**: `createPending` reserves quota and inserts a `pending` row in one transaction; `markReady` moves bytes from reserved to used; `purge` deletes the object, releases the right counter and deletes the row. All of them run under a `pessimistic_write` row lock so `completeUpload`, `remove` and the sweep cannot race.
- Quota is enforced by one conditional UPDATE (`used + reserved + bytes <= quota`), never read-then-write; overflow is 409 with code `STORAGE_QUOTA_EXCEEDED`. Max file size is `ARTIFACT_MAX_FILE_BYTES` (50 MiB, 413).
- A deleted `upload` row is kept until its presigned POST form expires (`expiresAt` + 15 min grace). Otherwise replaying the form would recreate an object with no row and no quota charge. Server-side sources free their quota immediately.
- Object keys are `workspaces/<workspaceId>/<artifactId>/<sanitized name>` (`toObjectKey`). The display name lives only in the row.
- Downloads always use content type `application/octet-stream` with an attachment disposition, because storage is proxied on the app origin.
- Not visible = 404, not 403 (`findVisible`), so ids do not leak. Shares resolve emails to members of the same workspace only; others count as `skipped`.
- Folders are personal: `findOwnedFolder` requires the caller as creator. `findReadableFolder` also accepts the workspace templates folder (root, no creator, name `custom-templates`), created on demand by `ensureTemplatesFolder` under an advisory lock. A user folder named `custom-templates` at the root is refused (`assertNotReservedRoot`): once its owner is deleted, `createdByUserId` goes NULL and it would match the templates folder.
- Workspace deletion: rows go by FK cascade; `WorkspacesService` then calls `deleteWorkspaceObjects` (fire-and-forget `deleteByPrefix`).

## Coupling

- Imported by `workspaces`, `projects`, `templates`, `agents`, `admin/workspaces`. Uses global `StorageService`, `EventBridgeService`, and the `WorkspaceMembers` repository through `DataSource`.
- `ArtifactFoldersService` injects `ArtifactsService`, not the reverse.
- `jobs-registry/jobs-registry.service.ts` reads `Artifact` rows directly (`signCustomTemplates`) and `templates` queries `artifacts` directly; keep `source`, `status`, `bucket`, `objectKey` and `updatedAt` semantics stable.

## Gotchas

- `ArtifactFoldersService.create/update/remove` have no HTTP route today; the folders controller is read-only.
- `replaceContent` holds the workspace usage row lock while uploading; fine for templates (≤ 256 KB), not for large files.
- `replaceContent` sets `updatedAt` by hand: connectors cache templates by `<id>-<updatedAt>`.

## Testing

`artifacts.service.spec.ts`, `artifact-quota.service.spec.ts`, `artifact-folders.service.spec.ts`. No controller specs.
