# apikeys module

Stores API keys in the `api_keys` table. Today it is used only for workspace keys, which authenticate the MCP endpoint.

## Layout

- `apikeys.module.ts`: `@Global()`, exports `ApiKeysService`.
- `apikeys.service.ts`: `create`, `findByKey`, `getCurrentApiKey`, `findOne`, `update`, `remove`, `revoke`. `apiKeysRepository` is public.
- `apikeys.controller.ts`: `@Controller('api-keys')` with no routes.
- `entities/apikey.entity.ts`: `ApiKey`.

## Public surface

- No HTTP routes. Workspace keys are read and rotated through `GET /workspaces/api-key` and `POST /workspaces/:id/api-key/rotate` (workspaces module).
- `McpGuard` (`src/mcp/mcp.guard.ts`) calls `findByKey` with the `x-oasm-api-key` header. It accepts only `type = WORKSPACE`, and sets `request.workspaceId = ref`.

## Data model

- `api_keys`: `key` is unique and stored **in plaintext** (lookup is an equality match). `type` is a varchar typed as `ApiKeyType` (`workspace`, `mcp`). `ref` is the owning id (the workspace id for `WORKSPACE`). Revocation uses `isRevoked` / `revokedAt`.
- `workspaces.apiKeyId` and `tools.apiKeyId` are one-to-one FKs into this table.

## Invariants

- `create` revokes every active key with the same `(type, ref)` before it saves the new one. "Create" therefore means "rotate", and there is at most one active key per `(type, ref)`. The two steps are not in a transaction.
- `getCurrentApiKey` **throws** a plain `Error` when no key exists, despite its `| null` return type. `WorkspacesService.getWorkspaceApiKey` catches that and rotates, so the first read creates a key.
- `findByKey`'s `NotFoundException` message contains the key. Callers (`McpGuard`) replace it with a generic 401. Do the same in any new caller.

## Coupling

- Imported explicitly by `WorkspacesModule`. Global for everyone else.
- `tools/tool-sync.service.ts` runs raw SQL on `api_keys` with `type = 'tool'`, a value that is not in `ApiKeyType`.

## Testing

No specs.
