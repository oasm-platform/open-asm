# templates module

Custom scan templates (nuclei YAML) stored as workspace artifacts, plus a route that runs them as nuclei jobs. It has no table of its own: a template is an `artifacts` row with `source = template` in the workspace's `custom-templates` folder.

## Layout

- `templates.service.ts`: `TemplatesService`, `validateTemplate(name?, content?)`, `MAX_TEMPLATE_BYTES` (256 KB).
- `templates.controller.ts`: routes under `templates`.
- `dto/templates.dto.ts`: request/response DTOs, `MAX_RUN_TEMPLATES = 100`.
- `templates.service.spec.ts`, `templates.controller.spec.ts`.

## Public surface

| Route | Permission |
|---|---|
| `GET templates` (`scope` mine/shared) | `artifact.read` |
| `GET templates/:id/content` | `artifact.read` + readable (`ArtifactsService.canRead`) |
| `POST templates` | `artifact.write` |
| `PUT templates/:id/content` | `artifact.write`, owner only; publishes `artifact.updated` |
| `PATCH templates/:id` (rename) | `artifact.write`, owner only; publishes `artifact.updated` |
| `POST templates/run` | `artifact.read` **and** `vulnerability.write` |

- Registered in `combine.module.ts`. Exports nothing. No delete route: templates are deleted through `DELETE artifacts/:id`, and sharing goes through the artifacts share routes.
- `create` publishes `artifact.created` from `ArtifactsService.createFromBuffer` with actor type `User`.

## Invariants

- **A template is identified by folder, not by `source` alone.** `findTemplates` requires a `ready` artifact of the workspace whose `parentFolderId` is the templates folder (`ArtifactFoldersService.ensureTemplatesFolder`) and that the caller can read; anything else is 404 "Template not found". `jobs-registry` checks `source = template` and `ready` when it signs them.
- `validateTemplate` is the trust boundary: name 1–200 chars ending `.yaml`/`.yml` (`TEMPLATE_NAME_RE` from `artifacts.service.ts`, also enforced by `ArtifactsService.update` for template rows), content ≤ 256 KB (413), parsable YAML mapping with a non-empty string `id` (400 with the YAML line number).
- Content is stored with mime type `application/yaml`; writes go through `ArtifactsService.createFromBuffer` / `replaceContent`, so they count against the workspace storage quota (409 when full).
- `scope=shared` lists other users' templates that are `public`, or `shared` with the caller.
- `run` needs exactly one non-empty scope among `targetIds`, `assetIds`, `projectIds` (400 otherwise), because `findAssetsForJob` ANDs targets with assets and treats an empty list as no filter. Projects resolve to their asset ids through `project_assets`, scoped to the workspace.
- `run` creates jobs with `JobsRegistryService.createNewJob` for the `nuclei` tool (404 if not installed) and passes `customTemplateIds`. The registry swaps those ids for presigned absolute URLs only when a worker claims the job, so edits saved before the claim are what runs. Zero jobs created is a 400.

## Coupling

- Imports `ArtifactsModule` (`ArtifactsService`, `ArtifactFoldersService`) and `StorageModule` (already global). Registers `Artifact` and `ProjectAsset` repositories and queries `artifacts` and `project_assets` directly.
- Uses `ToolsService` and `JobsRegistryService` from the global `ToolsModule` and `JobsRegistryModule` without importing them.
- `jobs-registry/jobs-registry.service.ts` owns the `customTemplateIds` → `customTemplates` signing (`signCustomTemplates`, cache key `<id>-<updatedAt>`); changing how templates are stored means changing that code too.

## Testing

`templates.service.spec.ts` covers create, the folder check, save/rename, getContent, getMany and run scopes; `templates.controller.spec.ts` asserts the permission guards per route.
