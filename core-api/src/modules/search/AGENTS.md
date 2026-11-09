# search module

Global search in the console: assets, targets and approved vulnerabilities in the current workspace, plus a per-user search history.

## Layout

- `search.controller.ts`: `/search` routes.
- `search.service.ts`: the combined search, vulnerability search, and history CRUD.
- `entities/search-history.entity.ts`: `SearchHistory`.
- `dto/search.dto.ts`: `SearchAssetsTargetsDto` (extends `GetManyBaseQueryParams`, adds `value`, `isSaveHistory`, `severity[]`).

## Public surface

| Route | Permission |
|---|---|
| `GET /search` | `asset.read` **and** `target.read` |
| `GET /search/histories` | session only, scoped to the user |
| `DELETE /search/histories/:id` | session only; the row must belong to the user, else 404 |
| `DELETE /search/histories` | session only; clears the user's history |

No events, queues or exports.

## Data model

- `search_histories`: `query`, `userId` FK to `users` with `ON DELETE CASCADE`. Index `(userId, createdAt)`. It has **no workspace column**, so history is shared across all of a user's workspaces.
- Saving (`isSaveHistory = true`) upserts by `(query, userId)`. A repeated query only bumps `createdAt` / `updatedAt`, which moves it to the top of the list.

## Invariants

- The asset/target limit is split by the ratio of `StatisticService.getTotalAssets` / `getTotalTargets`, with at least 1 target slot. `hasNextPage` uses those totals, not the filtered result counts.
- Vulnerabilities: at most `VULNERABILITY_SEARCH_LIMIT` (5), newest first. They are scoped through `asset → target.workspaceId` and filtered by `approvedVulnerabilityCondition('v')`, so AI proposals under review are hidden. The match covers name, `affectedUrl` and any `cveId` element (ILIKE). Without `value` or `severity` the list is empty.

## Coupling

- Imports `TargetsModule` (`getTargetsInWorkspace`), `AssetsModule` (`getManyAsssetServices`, with three s), `StatisticModule`. Registers the `Vulnerability` repository itself and does not import `VulnerabilitiesModule`.

## Gotchas

- `deleteAllSearchHistories` calls `delete({ user })` with the whole request user object, not `{ userId }`.
- `DELETE histories/:id` does not validate `id` as a UUID.
- History filtering uses case-sensitive `LIKE`. The vulnerability search uses `ILIKE`.

## Testing

`search.service.spec.ts` only checks that the service is defined.
