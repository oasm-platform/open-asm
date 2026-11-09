# tools module

The tool catalogue (built-in CLIs, manifest connectors, provider tools), per-workspace installation, and per-workspace connector config profiles with encrypted secrets.

## Layout

- `tools.controller.ts`: HTTP under `tools`. `tool-config-profiles.controller.ts`: HTTP under `tools/:toolId/config-profiles`.
- `tools.service.ts`: listing with install/readiness flags, install/uninstall, `getAgentTools`, `getToolByNames`, `createTool` (admin).
- `tool-config-profiles.service.ts`: profile CRUD, the single-default rule, `resolveConfigForJob` / `resolveConfigForDispatch` / `assertProfileOwnership`.
- `tool-sync.service.ts`: `ToolSyncService.onModuleInit` syncs built-ins and manifest connectors into `tools`. Not exported.
- `tool-categories.ts`, `tool-io.ts`, `tool-target-types.ts`: pure helpers (`resolveToolCategory`, `resolveStepInputs`, `resolveToolTargetTypes`, manifest parsing) shared with workflows, projects and jobs-registry.
- `tools-provider/built-in-tools.ts`: `builtInTools` (command templates and result parsers).
- `validators/tool-config-profiles.crypto.ts`: sensitive-field detection, encrypt/decrypt/mask. `validators/tool-config-profiles.validator.ts`: cached AJV validation against the connector `configSchema`.

## Public surface

| Route | Permission |
|---|---|
| `POST tools/add-to-workspace`, `POST tools/install`, `POST tools/uninstall` | `workspace.write`; install/uninstall publish `tool.installed` / `tool.uninstalled` |
| `GET tools`, `GET tools/installed`, `GET tools/connectors/:slug`, `GET tools/:id`, `GET tools/:id/schema` | `workspace.read` |
| `GET tools/built-in-tools` | no `@WorkspaceAccess`; deprecated |
| `GET/POST tools/:toolId/config-profiles`, `GET :id` | `workspace.read` / `workspace.write` |
| `PATCH/DELETE tools/:toolId/config-profiles/:id`, `POST :id/set-default` | `workspace.write` |

- `POST /admin/tools` (admin module) calls `ToolsService.createTool`, which creates a `PROVIDER` tool.
- Exports `ToolsService` and `ToolConfigProfilesService`. The module is `@Global()`.

## Data model

- `tools` (`Tool`, does not extend `BaseEntity`): `@Unique(['name'])`. For a connector, `name` is the lowercased manifest **slug**, never the display name. `categories` is a jsonb array of `ToolCategorySpec` with `CHK_tools_categories_not_empty`; order matters, because the first entry is a step's default category. `type` is `BUILT_IN`, `CONNECTOR` or `PROVIDER`. Deleting a tool cascades to its `jobs`, `vulnerabilities` and `assetTags`. `isInstalled`, `isReady`, `hasConfigProfile`, `availableWorkersCount`, `agentTool` and `parser` are not columns.
- `workspace_tools` (`WorkspaceTool`) is the install record, with `isEnabled`. The FK to `tools` is NO ACTION, so these rows must be deleted before the tool. Deleting a workspace cascades. The index is not unique; the services check for duplicates.
- `tool_config_profiles` (`ToolConfigProfile`): unique `(workspace, tool, name)`. Both FKs cascade. `config` is jsonb with sensitive fields encrypted under the workspace DEK. "One default per workspace+tool" is enforced by the service, not the database. There is no FK to `workspace_tools`. `jobs.configProfileId` is `SET NULL`.

## Invariants

- Connector lookup everywhere is `ConnectorRegistryService.getConnector(tool.name)`.
- **Readiness.** A built-in tool is always installed and ready. A connector is installed when its `workspace_tools` row has `isEnabled`. It is ready when it is installed and either its manifest has no `configSchema` or the workspace has a profile for it. `agentTool` means built-in, or manifest `agentTool: true`.
- **Sensitive fields** are the schema properties with `ui:widget: password`, or whose name matches `/(password|passwd|secret|token|api_?key|access_?key)/i`. They are encrypted at rest and masked (`****…`) in every response.
- **Profile update.** An incoming masked value (`isMaskedValue`) keeps the stored ciphertext. A rename-only update saves without re-encrypting, because re-encrypting would double-encrypt the stored values.
- The first profile for a workspace+tool becomes the default. Deleting the default promotes the oldest remaining profile. `setDefault` runs in a transaction.
- Deleting a profile returns 409 while a job in the workspace or a workflow's `content.jobs` references it.
- `resolveConfigForJob` takes the explicit profile, which must belong to the same workspace and tool (otherwise 404), or else the default profile. It then deep-merges the decrypted inline config. **The result is plaintext.**
- `uninstallTool` deletes the `workspace_tools` row and the workspace's profiles for that tool in one transaction.

## Tool sync (`ToolSyncService`, every boot)

- Errors are swallowed so a failed sync does not block boot. Each step runs under a Redis `@Lock` (`connector-sync`, `connector-override`, `connector-override-dedup`, `connector-tools-sync`, `provider-tools-sync`, `built-in-tools-sync`).
- Built-ins from `builtInTools` are upserted. A same-named row of another type is never overwritten. Built-ins no longer declared are deleted.
- Connectors are read from `<cwd>/resources/connectors/manifest.json`, which is generated by `task sync-connectors`; never hand-edit it. A connector overrides any row with its slug, whatever that row's type. Legacy duplicate rows are merged by rewriting `toolId` in `workspace_tools`, `workers`, `tool_config_profiles`, `api_keys.ref`, `jobs`, `vulnerabilities`, `asset_services_tags` and `asset_tags`.
- **A connector that disappears from the manifest is deleted, and the delete cascades to its jobs, vulnerabilities and profiles.** A manifest entry with no supported capability is skipped but still counts as present, so it is not deleted.
- Connectors get `isOfficialSupport` when `author === 'oasm'` and priority `MEDIUM`. Logos are uploaded to storage bucket `system` as `connectors/<slug>.png`.

## Coupling

- Imports `forwardRef(() => WorkersModule)` and `ConnectorsModule`. `ToolsService` injects `WorkersService` with `forwardRef` and counts workers through `workersService.repo`. This is part of the tools ↔ workers ↔ jobs-registry cycle; see the comment in `combine.module.ts`, where `AdminModule` must load after `JobsRegistryModule`.
- Registers the `Asset` and `Vulnerability` repositories (exposed as public `assetRepo` / `vulnerabilityRepo`).
- Used by: jobs-registry (`resolveConfigForJob`, `assertProfileOwnership`, `getToolByNames`, the helpers, `builtInTools`, `maskProfile`), `workflows.service.ts`, `projects/project-workflows.service.ts`, agents (`getManyTools`, `installTool`, `getInstalledTools`, `getAgentTools`, `getToolById`), `admin.controller.ts`, `templates.service.ts`, `vulnerabilities.service.ts`. `connectors/connector-registry.service.ts` imports the `ManifestCapability` type from `tool-categories.ts`.

## Gotchas

- `getToolByNames` by default (`isInstalled = false`) ignores installation. `WorkflowRunnerService` calls it that way, so a workflow step can dispatch a connector the workspace never installed.
- The profile routes ignore the `:toolId` path param for get/update/delete/set-default. Ownership is checked by workspace only (`findOwned`).
- `addToolToWorkspace` does not load the tool first, so a bad id is an FK error. `installTool` returns 404 instead.
- `createTool` checks for duplicates by `name + PROVIDER`, but the database unique constraint is on `name` alone.
- `getManyTools` sorts by `name ASC` unless a non-default, whitelisted `sortBy`/`sortOrder` is passed.

## Testing

Colocated specs: `tools.service`, `tools.controller`, `tool-config-profiles.service`, `tool-sync.service`, `tool-categories`, `tool-io`, `tool-target-types`, `validators/tool-config-profiles.crypto`, `tools.audit-wiring` (install/uninstall events).
