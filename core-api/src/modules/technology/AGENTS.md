# technology module

Read-only technology catalogue: turns a detected technology name into its description, categories and a signed icon URL. No tables; everything lives in Redis and the `cached-static` storage bucket.

## Layout

- `technology-forwarder.service.ts`: `TechnologyForwarderService`, all of the logic.
- `technology.controller.ts`: `TechnologyController` on `technology`, with **no routes** (an empty Swagger tag).
- `dto/technology-detail.dto.ts`: `TechnologyDetailDTO`, `CategoryInfoDTO`.
- `technology-forwarder.service.spec.ts`: unit tests (Redis and `StorageService` mocked).

## Public surface

- `@Global()` module, exports `TechnologyForwarderService`. Outside callers only use `enrichTechnologies(names)` (`AssetsService`, `StatisticService`). `fetchTechnologyInfo` and `getCachedTechnologyInfo` have no outside callers.
- No HTTP routes, events, queues or gRPC.

## Data model (Redis)

- Source: `WEBAPP_ANALYZER_SRC_URL` (`common/constants/app.constants.ts`), the `webappanalyzer` repo on GitHub: `technologies/<a-z>.json`, `categories.json`, `images/icons/<icon>`.
- `technology:<name>`: raw catalogue JSON per technology. The boot import writes it with **no TTL** and never overwrites an existing key. `fetchTechnologyInfo` rewrites it with a 30-day TTL (`CACHE_TTL`).
- `technology:status:<letter>.json`: file already imported. `technology:initialization:completed`: global "import done" flag.
- `categories`: the category map, 30-day TTL.
- `icon:v2:<icon>`: the raw `cached-static/<md5>.<ext>` storage path of the uploaded icon, 30-day TTL. The signed URL is computed on every call (`StorageService.signStoragePath`) and never cached. `asRawIconPath` ignores old values that contain `/api/`.

## Invariants

- `onModuleInit` starts the A-Z import in the background (not awaited, 1 s delay between files) unless the init flag is set. It returns early when `E2E=1`.
- Redis is a cache, not a dependency, for icons: a read or write failure still forwards and uploads the icon. `enrichTechnologies` returns empty `TechnologyDetailDTO`s on any Redis error. Callers must accept DTOs without `name`.
- The cache keys are global, not per workspace (the comment in `getIconUrl` that calls `technology:` "workspace-scoped" is wrong).

## Gotchas

- `enrichTechnologies` looks names up with one Lua `MGET` on `technology:<name as given>`, and strips `:version` only after the lookup. A `Nginx:1.25` string misses the cache and comes back empty. `getTechnologyAssets`, `getAssetGraph` and `StatisticService` strip the version first; `AssetsService.enrichTechStrings` (asset list rows) passes `name:version` as is.
- To force a re-import, delete `technology:initialization:completed` and the `technology:status:*` keys. Existing `technology:<name>` keys are still kept.

## Coupling

- Injects `RedisService` and `StorageService` (global `StorageModule`). Imported explicitly by `AssetsModule` and registered in `combine.module.ts`.
