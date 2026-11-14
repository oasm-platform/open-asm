# search module

Global search in the console: assets, targets and approved vulnerabilities in the current workspace, plus a per-user search history.

## Layout

- `search.controller.ts`: `/search` routes.
- `search.service.ts`: the combined search, vulnerability search, and history CRUD.
- `entities/search-history.entity.ts`: `SearchHistory`.
- `dto/search.dto.ts`: `SearchAssetsTargetsDto` (extends `GetManyBaseQueryParams`, adds `value` (max 255), `isSaveHistory`, `severity[]`).

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

- `value` is trimmed and capped at `SEARCH_VALUE_MAX_LENGTH` (255) by the DTO. A blank value returns no assets or targets; vulnerabilities then need `severity`.
- Every match is `ILIKE` with `%`, `_` and `\` escaped (`containsLikePattern` in `common/utils/like-pattern.util.ts`), so user input is never a wildcard.
- The limit is split by `splitSearchLimit` from the **filtered** totals: targets get up to `floor(limit / 2)`, and whatever one side cannot fill goes to the other. The split depends only on the totals, so it is the same on every page. `pageCount = max(ceil(assetsTotal / assetsLimit), ceil(targetsTotal / targetsLimit))`, `hasNextPage = page < pageCount`.
- Round 1 fetches page 1 of both at the full limit (this also yields the totals), alongside the vulnerability search and the history save. A page > 1 needs a second round at the per-type limits.
- `total` = assets total + targets total + returned vulnerabilities. The console shows "Ask AI" when it is 0, so keep the field.
- Vulnerabilities: at most `VULNERABILITY_SEARCH_LIMIT` (5), newest first. They are scoped through `asset → target.workspaceId` and filtered by `approvedVulnerabilityCondition('v')`, so AI proposals under review are hidden. The match covers name, `affectedUrl` and `array_to_string(cveId, ' ')`. Without `value` or `severity` the list is empty.

## Coupling

- Imports `TargetsModule` (`getTargetsInWorkspace`) and `AssetsModule` (`getManyAsssetServices`, with three s). Registers the `Vulnerability` repository itself and does not import `VulnerabilitiesModule`.

## Gotchas

- Without a trigram index every non-matching term is a full scan of `asset_services` and `vulnerabilities` (about 65–110 ms on 70k assets). A `pg_trgm` GIN proposal is in `.agents/research-reports/search-query-optimization.md` and waits for owner approval.
- `DELETE histories/:id` rejects a non-UUID id with 400 (`ParseUUIDPipe`).

## Testing

`search.service.spec.ts` covers trimming, the limit split and backfill, paging, the escaped vulnerability pattern, history save/bump/filter and delete-all by `userId`.
