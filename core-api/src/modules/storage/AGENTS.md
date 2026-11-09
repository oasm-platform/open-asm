# storage module

S3-compatible object storage (RustFS locally, any S3 in the cloud): bucket setup, uploads, presigned URLs and the read-authorization rules for objects. No database tables of its own.

## Layout

- `storage.service.ts`: `StorageService`, the `BUCKET_ACCESS` map, `PUBLIC_READ_BUCKETS`, helpers `getHourBucketedSigningDate` and `attachmentDisposition`.
- `storage.config.ts`: `parseStorageConfig` reads every storage env var, never throws (bad values fall back to defaults with a warning).
- `rustfs.client.ts`: `RustFsClient` with two `S3Client`s, one for server calls and one for signing presigned URLs.
- `storage.controller.ts`: presign routes and `authorizeRead`.
- `dto/presign-storage.dto.ts`, `types/multer.d.ts`.

## Public surface

| Route | Permission |
|---|---|
| `POST storage/presign/upload` | `@Roles(Role.ADMIN)`; bucket must exist and not be `private` |
| `GET storage/presign/download?bucket&path&fileName` | authenticated session (global guard); then `authorizeRead` by bucket class |

- `@Global()` module, registered in `app.module.ts` (not in `combine.module.ts`). Exports `StorageService` only.
- Main methods: `uploadFile(fileName, buffer, bucket, contentType?)`, `getFile(key, bucket)`, `headObject(bucket, key)`, `deleteFile(key, bucket)`, `deleteByPrefix(bucket, prefix)`, `listFiles(bucket)`, `readJsonFile(key, bucket)`, `getPresignedUploadUrl`, `getPresignedDownloadUrl`, `getPresignedPost`, `getClientUrlForPath`, `signStoragePath(s)`, `forwardImage(url)`, `generateObjectKey`.

## Buckets

`BUCKET_ACCESS` is the single list of buckets; `onModuleInit` creates each one, applies CORS (when `CORS_ALLOWED_ORIGINS` is set) and a public-read policy for `PUBLIC_READ_BUCKETS`.

| Bucket | Class | Written by |
|---|---|---|
| `system` | public | admin logo upload, connector logos (`tools/tool-sync.service.ts`) |
| `cached-static` | authenticated | technology icons (`technology-forwarder.service.ts`) |
| `screenshot` | tenant | `DataAdapterService.screenshot` |
| `job-results` | private | `jobs-registry` result files (cleaned by `job-result-cleanup.service.ts`) |
| `reports` | private | `ReportsService` PDFs |
| `artifacts` | private | `ArtifactsService` |
| `default` | blocked | nothing should use it |

## Invariants

- `private` means the browser can never get a URL through the generic routes or `getClientUrlForPath` (400/403). Private objects are only reachable through a domain service that checks access and then calls `getPresignedDownloadUrl` itself (reports, artifacts, job results). The service-level presign methods do **not** check bucket class.
- `tenant` reads resolve the owning workspaces with `resolveObjectWorkspaceIds` (only `screenshot` is implemented, via `asset_services.screenshotPath`) and allow a member of **any** of them, because screenshot keys collide across workspaces. An unknown object is 404.
- Two URL modes. `STORAGE_URL_BASE` unset → relative mode: URLs are `/api/storage/...`, served by the vite proxy and console nginx, and signed against `RUSTFS_ENDPOINT` path-style. `STORAGE_URL_BASE=""` → absolute mode against `S3_PUBLIC_ENDPOINT`. Signing against the wrong host gives `SignatureDoesNotMatch`.
- Pass `absolute: true` to `getPresignedDownloadUrl` for non-browser clients (connectors fetching custom templates).
- Presign TTL is clamped to 60s–172800s. With TTL ≥ 2h the signing date is floored to the hour so repeated presigns return identical URLs (cache-friendly).
- Public-read buckets get unsigned URLs only if the policy was verified at boot (`publicReadApplied`); otherwise they fall back to a presign.
- `assertValidLocation` rejects keys starting with `/`, `.` or space, or containing `..`. `generateObjectKey` refuses files without an extension and `restrictedExtensions` (exe, sh, js, py...).
- `getPresignedPost` pins exact size and content type in the policy; it needs RustFS >= 1.0.0-alpha.83 to be enforced.

## Coupling

- Used by: `admin/system-configs`, `artifacts`, `assets`, `connectors/connector-logo.controller.ts`, `data-adapter`, `jobs-registry`, `projects/project-files.service.ts`, `reports`, `root`, `technology`, `templates`, `tools/tool-sync.service.ts`.
- `StorageService` queries `asset_services`/`assets`/`targets` with raw SQL for tenant reads, and `StorageController` uses `WorkspacesService.getMembershipWithPermissions`.

## Gotchas

- Argument order is inconsistent: `headObject(bucket, key)` and `listFiles(bucket)` take the bucket first; `getFile`, `deleteFile`, `readJsonFile` and `uploadFile` take the key/name first and default the bucket to `default`.
- `uploadFile` does not check the bucket list. On `NoSuchBucket` it creates the bucket and retries once, so a typo creates a new bucket.
- `deleteByPrefix` refuses an empty prefix and counts failed deletes instead of throwing.
- Credentials fall back to `rustfsadmin`/`rustfssecret` unless both `RUSTFS_ACCESS_KEY` and `RUSTFS_SECRET_KEY` are set or `S3_USE_DEFAULT_CREDENTIALS=true`.

## Testing

`storage.service.spec.ts`, `storage.controller.spec.ts` (including route declarations) and `storage.config.spec.ts` mock the S3 clients. No test hits a real bucket.
