# root module

Public, unauthenticated endpoints at the API root: the health check, system metadata for the console boot screen, and the latest release info.

## Layout

- `root.controller.ts`: `@Controller()` with no prefix. Every route is `@Public()`.
- `root.service.ts`: `RootService`.
- `dto/root.dto.ts`: `GetMetadataDto`, `GetVersionDto`.

## Public surface

| Route | Notes |
|---|---|
| `GET /api/health` | returns `'OK'`. The Docker healthcheck uses it |
| `GET /api/metadata` | `isInit`, system `name`/`logoPath` (signed URL), `allowSignUp`, `currentVersion` (`APP_VERSION`), `storagePresignTtlSeconds`, repo/docs/home URLs |
| `GET /api/version/latest` | reads Redis `version:latest`, written by `SystemConfigsService.checkUpdate`. 404 when it is missing |

## Coupling

- Imports `UsersModule` (`usersService.usersRepository`) and `SystemConfigsModule` (`getConfig`, `isSignUpAllowed`). `StorageService` and `RedisService` are global.
- Imported only by `combine.module.ts`. Nothing injects `RootService`.

## Gotchas

- `isInit` (whether an admin exists) uses the TypeORM Redis query cache with id `isInit`. The comment says one year, but `MILLISECONDS_PER_SECOND = 100` makes it about 36 days. Nothing invalidates it after `POST /admin/init`, so a cached `false` stays stale until it expires or the Redis key is cleared.
- `getMetadata` creates the `system_configs` row if it does not exist yet (through `getConfig`).
- In `NODE_ENV=development`, `getLatestVersion` reports `currentVersion = latestVersion`, so `isLatest` is always true.

## Testing

`root.service.spec.ts`.
