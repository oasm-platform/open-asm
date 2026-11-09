# workflows module

Workflow definitions per workspace: a DAG of tool jobs stored as jsonb in `workflows.content`. It also covers the default workflows synced from YAML, and the pure graph logic the run engine (jobs-registry) uses. `@Global()`, registered in `combine.module.ts`.

## Layout

- `workflows.controller.ts`: HTTP routes under `workflows`.
- `workflows.service.ts`: CRUD; every write runs `normalizeContent` and then `assertStepsCanRun`.
- `workflow-graph.ts`: pure DAG logic (no DB, no DI): `jobEntries`, `normalizeWorkflowContent`, `buildWorkflowGraph`, `orderedJobEntries`, `planAdvance`, `reconcileStepStates`, `filterGraphByAssetsDiscovery`, run-step types.
- `workflow-template.service.ts` + `templates/*.yaml`: the default workflows (file names in the `DefaultWorkflow` enum). Copied to `dist` by the `**/*.yaml` asset rule in `nest-cli.json`.
- `trigger-workflow.service.ts`: runs a workflow on in-process target events. **Provided by `TargetsModule`, not by this module.**
- `entities/workflow.entity.ts`: the `Workflow` entity plus the content classes `WorkflowContent`, `On`, `ScheduleOn`, `WorkflowJob` (also used as the request DTO shape).

## Public surface

| Route | Permission |
|---|---|
| `GET workflows/templates` | authenticated only (global `AuthGuard`), no workspace; returns template file names |
| `GET workflows`, `GET workflows/:id` | `workflow.read` |
| `POST workflows`, `PATCH workflows/:id`, `DELETE workflows/:id` | `workflow.write` |

- Events (`@PublishEvent`): `workflow.created`, `workflow.updated` (with `changes.name` only on a rename), `workflow.deleted`. The delete config sets no `resourceId` and no `resourceIdFromRoute`, so a successful delete event carries no `resourceId`. `workflow.run.*` events come from jobs-registry, not from here.
- Exports `WorkflowsService` (its `workflowRepository` is public and used by other modules) and `WorkflowTemplateService`.

## Data model

- `workflows`: unique (`filePath`, `workspace`); `content` jsonb; `createdBy` nullable user FK without cascade; workspace delete cascades; `isCanEdit` / `isCanDelete` default true, false for template rows. `JobHistory.workflow` and `ProjectWorkflow.workflow` cascade, so deleting a workflow deletes its runs and project bindings.
- `content.jobs` is canonically a map keyed by job id, and `needs` lists job ids. The legacy array form (id = `name`, else the tool) is still read by `jobEntries` and converted on every write. The HTTP DTO only accepts the map.
- `content.on`: `target` (`<type>.<action>` strings such as `domain.create`), `schedule` (cron list), and the project event keys `project.assets.added`, `project.run.completed`, `vulnerability.detected` (owned by projects, see `projects/workflow-on.ts`).

## Invariants

- jsonb does not keep object key order. Never rely on the order of the `jobs` map: use `orderedJobEntries` / `buildWorkflowGraph`, and compare content with `canonicalJson` (as the template sync does).
- Every write validates the graph (unknown `needs`, cycles) and fails with 400 listing all errors. `assertStepsCanRun` then checks each job's tool category, its `input` kinds, and that the category can scan at least one target type that `on.target` fires for. Partial overlap is allowed. Unknown tools pass (the run reports them).
- `filePath` is an identity, not a path:
  - template rows have `filePath` = template file name, one per workspace;
  - project-owned workflows are `project-<projectId>-<uuid>.yaml` (legacy `group-<projectId>.yaml`);
  - `url-discovery.service.ts` and `VulnerabilitiesService.findScanWorkflow` look up default workflows by `DefaultWorkflow` file name.
- Template sync: `onModuleInit` runs `createDefaultWorkflows` for every workspace on every boot, and `WorkspacesService` runs it for a new workspace. A row whose content or name differs from the YAML is overwritten, so edits to a template row are lost at the next boot. An invalid template is logged and skipped. `normalizeOn` wraps a string under any `on` key into an array.

## Coupling

- `forwardRef` cycle with `WorkspacesModule` in both directions.
- `TriggerWorkflowService` subscribes with `EventEmitter2.onAny` to **every** in-process event. It splits the name at the first dot into (`on` key, action) and runs the first matching workflow of the target's workspace through `WorkflowRunnerService.startRun`, skipping `project-%` and `group-%` workflows. A third emit argument `{ jobRunType: SCHEDULED }` marks scheduled runs; anything else is `MANUAL`. The jsonb query relies on the GIN index from migration `AddPerformanceIndexes`.
- `workflow-graph.ts` is imported by jobs-registry (`workflow-runner.service.ts`, `jobs-registry.service.ts`, `job-history.entity.ts`), projects, statistic and vulnerabilities.
- Projects writes `workflows` rows directly (`ProjectWorkflowsService.create`, `ProjectTriggersService.writeOn`) and saves pipeline edits through `WorkflowsService.updateWorkflow`. The entity file imports projects' `ProjectWorkflow` and `EventTriggerConfig`.

## Gotchas

- `getWorkspaceWorkflow` throws a plain `Error` when nothing matches, so get, update and delete of a missing or foreign id return 500, not 404.
- The server never checks `isCanEdit` / `isCanDelete`, and `filePath` can be set by the client. The `/workflows` routes can edit or delete template rows and project-owned workflows (the latter bypasses the project's archived check).
- `getManyWorkflows` also lists project-owned workflows. Its `name` filter is a case-sensitive `LIKE`.
- List and get join the whole `createdBy` `User` entity into the response (email, role, …). That breaks the repo rule that user data exposes only `id`, `name`, `image`. Do not copy the pattern.
- `getTemplate(name)` looks a row up by name across all workspaces.

## Testing

`workflows.service.spec.ts`, `workflow-graph.spec.ts`, `workflow-template.service.spec.ts`, `trigger-workflow.service.spec.ts`, `workflows.audit-wiring.spec.ts` (decorator configs), and `templates.contract.spec.ts`. The last one checks every shipped template against the built-in tools and `resources/connectors/manifest.json`, so a template edit can fail it.
