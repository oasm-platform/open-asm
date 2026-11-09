# providers module

CRUD for `ToolProvider`, the vendor/publisher record a `Tool` can point to. Rows are owned by a user, not by a workspace.

## Layout

- `providers.controller.ts`: routes under `providers`.
- `providers.service.ts`: owner-scoped queries.
- `entities/provider.entity.ts`: `ToolProvider` and the `AuthType` enum (not used by any column).
- `dto/`: `CreateProviderDto` (a `PickType` of the entity, so validation lives on the entity), `UpdateProviderDto`, `ProvidersQueryDto` (`name` filter, ILIKE).

## Public surface

| Route | Permission |
|---|---|
| `GET/POST providers` | authenticated user only (no `@WorkspaceAccess`/`@Roles`) |
| `GET/PATCH/DELETE providers/:id` | authenticated user; the service checks ownership |

Exports `ProvidersService`, which no other module injects today. It publishes no events and has no queues.

## Data model

- Table `tool_providers`. `code` is globally unique (not per owner). Soft delete via `deletedAt`.
- `owner` is a `ManyToOne` to `User` with no `onDelete` option. The inverse side is `User.toolProviders`.
- `tools.providerId` → `tool_providers`, `ON DELETE SET NULL` (declared on `Tool` in the tools module).

## Invariants

- **Scoping is by owner (`userContext.id`), not by workspace.** The list filters on `owner.id`. Get, update and delete load the row and return **404, never 403**, when the owner differs.
- `findProviderOrThrow` has no ownership check and is private. New public paths must go through the owner check.
- Delete is `softDelete`. A second create with the same `code` still violates the unique index, even after the first row was soft-deleted.

## Gotchas

- `getProviderById` / `updateProvider` load `relations: { owner: true }` and return the entity unchanged, so the response includes the full owner `User` row (email, role, ban fields), not just `id` / `name` / `image`.
- `GET providers` is ordered by `name` ASC with its own `page`/`limit` math; it ignores `sortBy`/`sortOrder` from `GetManyBaseQueryParams`.

## Testing

`providers.service.spec.ts` only checks that the service is defined.
