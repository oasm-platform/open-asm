# connectors module

In-memory catalogue of scanner connectors (container images the worker runs), loaded from `resources/connectors/manifest.json`, plus the public logo route. It has no database tables. This is not `integrations/connectors/`, which holds the third-party app connectors.

## Layout

- `connector-registry.service.ts`: `ConnectorRegistryService`, the `ConnectorManifestEntry` / `ResourceDefaults` types, and the manifest parsing.
- `connector-logo.controller.ts`: `ConnectorLogoController`.
- `connectors.module.ts`: declares both and exports only the registry.

## Public surface

- `GET connectors/:file` (served as `/api/connectors/:file`): `@Public()`, no auth. Streams `connectors/<file>` from the `system` storage bucket with a long `Cache-Control`. Content-Type is set only for png/jpg/jpeg/svg/webp.
- Exports `ConnectorRegistryService`:
  - `getConnector(slug)` / `getAllConnectors()`: raw manifest entries, keyed by `slug`.
  - `getAgentConnectors()`: entries with `agentTool === true` **and** a non-empty `image`.
  - `getResourceDefaults(slug)`: `{ cpu, memory, timeoutSeconds }`, never null.
  - `getConnectorSchema(slug)` / `getEffectiveSchema(slug)`: `configSchema` only (`source` is `'configSchema'` or `null`).
- No routes list connectors. Those live in `tools` / `jobs-registry`.

## Invariants

- The manifest loads once in `onModuleInit` from `path.resolve(process.cwd(), 'resources/connectors/manifest.json')`, so the process must start with `core-api/` as its cwd. A missing file, invalid JSON or an empty `connectors` array only logs a warning, and the registry stays empty: every lookup returns `null`/`[]` and boot does not fail.
- `resourceDefaults` are validated per field. CPU matches `^[0-9]+(\.[0-9]+)?m?$`. Memory is an integer with an optional `Mi|Gi|Ki|M|G|K` suffix (the worker rejects fractions). `timeoutSeconds` is a positive integer. Each invalid or missing field falls back on its own to `500m` / `512Mi` / `600`, and an unknown slug gets all three defaults.
- `egress` is `direct` or absent (= proxy). `jobs-registry.controller.ts` and `agents/tools/connector.tools.ts` turn `egress === 'direct'` into `directEgress` on the gRPC Job / ToolRun; the worker then skips its egress proxy for that container. Send it camelCase: proto-loader runs with `keepCase: false` and drops snake_case keys.
- `manifest.json` is generated (`task sync-connectors`) and must not be hand-edited. Change the manifest upstream and re-sync.
- Duplicate slugs in the manifest: the last entry wins (plain `Map.set`).

## Coupling

- Imported by `tools`, `jobs-registry`, `workers`, `projects` and `agents`. The main callers are `tools.service.ts` / `tool-config-profiles.service.ts` (schemas, config validation), `jobs-registry` (image and resource defaults at dispatch), `workers.service.ts` (`getAllConnectors`, logo URL `/connectors/<slug>.png`), `projects/project-workflows.service.ts`, and `agents/tools/connector.tools.ts` (`getAgentConnectors`, `getResourceDefaults`).
- `StorageService` is injected without importing `StorageModule`, because that module is `@Global()`.
- Logo files are written by `tools/tool-sync.service.ts` (`connectors/<slug>.png` in the `system` bucket), not by this module.
- Imports `ManifestCapability` (type only) from `tools/tool-categories`.

## Testing

There are no specs in this module. Consumers mock `ConnectorRegistryService` (see `jobs-registry/*.spec.ts`, `workers/workers.service.spec.ts`, `tools/*.spec.ts`).
