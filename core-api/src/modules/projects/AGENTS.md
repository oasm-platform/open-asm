# projects module

A project is a named set of workspace assets (picked by hand or selected by scope rules). It owns workflows with their own triggers (cron and events), and its runs, findings and chat-context files. `@Global()`, registered in `combine.module.ts` and also imported explicitly by `AgentsModule`.

## Layout

- `projects.controller.ts`: every route under `projects`; the `PROJECT_UPDATED(ProjectChange.X)` helper decorator.
- `projects.service.ts`: create (with compensating rollback), update, archive/unarchive, delete, `addDiscoveredAssets` (the `PROJECT_ASSET_DISCOVERY` implementation), `project.assets.added` publishing.
- `project-access.ts`: `findProjectOrFail` (404, and 400 on an archived project when `writable`).
- `project-assets.service.ts`: hand-picked assets, asset list, candidates.
- `project-scope.service.ts` + `scope-rules.ts`: include/exclude rules compiled to raw SQL (`scopeRulesSql`, `SqlParams`); sync, preview, discovery matching.
- `project-workflows.service.ts` + `pipeline.ts`: project-owned workflows (from tools, a template or a copy), `startBindingRun`, `buildToolJobs` (encrypts inline connector secrets).
- `project-triggers.service.ts` + `workflow-on.ts`: cron and event triggers, BullMQ schedulers, Redis batch windows, chain-depth guard (the `PROJECT_TRIGGER_EVENTS` implementation).
- `processors/project-schedule.processor.ts`: `ProjectScheduleConsumer` (cron fire) and `ProjectTriggerEventsConsumer` (batch window closed).
- `project-run-events.listener.ts`: turns in-process `EventTriggerType.WORKFLOW_END` into `project.run.completed`.
- `project-results.service.ts` + `provenance.ts`: overview, runs, vulnerabilities, timeline, activity (raw SQL).
- `project-files.service.ts`: artifacts linked as chat context, at most `PROJECT_FILE_LIMIT = 5`.

## Public surface

All routes use `@WorkspaceAccess`:

| Permission | Routes (under `projects`) |
|---|---|
| `project.read` | `GET /`, `GET workflow-templates`, `POST scope-preview`, `GET :id`, `GET :id/{overview,assets,assets/candidates,scope-rules,workflows,triggers,runs,vulnerabilities,files}`, `GET :id/vulnerabilities/:vulnerabilityId/timeline` |
| `project.write` | `POST /`, `PATCH`/`DELETE :id`, `POST :id/archive`, `POST :id/unarchive`, `POST`/`DELETE :id/assets`, `PUT :id/scope-rules`, `POST :id/workflows`, `PATCH`/`DELETE :id/workflows/:bindingId`, `POST :id/workflows/:bindingId/run`, `POST :id/triggers`, `PATCH`/`DELETE :id/triggers/:triggerId`, `POST :id/files/presign`, `POST :id/files/:artifactId/complete`, `DELETE :id/files/:artifactId` |

- `@PublishEvent`: `project.created`, `project.deleted`, `project.archived`, `project.unarchived`. `project.updated` goes through `PROJECT_UPDATED(ProjectChange.X)` on settings, assets add/remove, scope, workflow add/update/remove and trigger create/update/delete; `metadata.change` names the change for the activity feed. A new mutating route needs its own `PROJECT_UPDATED`. Manual run and file routes publish nothing.
- Direct `publishSafely`: `project.assets.added` (payload `ProjectAssetsAddedPayload`, only when ids were actually added), `project.updated` with `change: assets.discovered` and a System actor (discovery has no request), and `project.run.completed` (from the listener; cancelled runs never finish this way).
- In-process: `PROJECT_DELETING_EVENT` (`'project.deleting'`) is awaited with `emitAsync` before a delete, while cascading rows can still be read. `AgentsService` handles it.
- Consumed: the bridge `projects` lane (`ProjectsSink`) calls `addDiscoveredAssets` on `asset.discovered` and `ProjectTriggersService.onTriggerEvent` on `project.assets.added`, `project.run.completed`, `vulnerability.detected`.
- Queues: `BullMQName.PROJECT_WORKFLOW_SCHEDULE` (value `asset-groups-workflow-schedule`; one job scheduler per cron trigger, id `project-trigger:<triggerId>`) and `BullMQName.PROJECT_TRIGGER_EVENTS` (delayed `event-trigger` jobs, one per open batch).
- Exports all seven services plus the tokens `PROJECT_ASSET_DISCOVERY` and `PROJECT_TRIGGER_EVENTS` (`useExisting`).

## Data model

- `projects`: unique (`name`, workspace); `archivedAt` marks archived (no soft delete); `autoAddAssets` default true; `instruction` up to 2000 chars. Workspace delete cascades.
- `project_assets`: unique (`projectId`, `assetId`); `source` `manual | rule`; `scopeRuleId` set to NULL when its rule goes. Cascades from project and asset.
- `project_scope_rules`: `mode` include/exclude, `type`, `value`.
- `project_workflows` (the binding): unique (`projectId`, `workflowId`); cascades from project and from workflow.
- `project_workflow_triggers`: `type` cron/event, `cron`, `event`, `config` jsonb (`EventTriggerConfig`), `enabled`, `lastFiredAt`, `schedulerId`. Cascades from the binding.
- `project_vulnerabilities`: unique (`projectId`, `vulnerabilityId`), first/last-seen run (set to NULL when the run is deleted), `timesSeen`. Written only by `data-adapter.service.ts` (raw upsert); this module only reads it.
- `project_artifacts`: unique (`projectId`, `artifactId`); both sides cascade.
- Run columns on `job_histories` (`projectId` set to NULL on project delete, `projectWorkflowId`, `triggerId`, `causedByRunId`, `chainDepth`) belong to jobs-registry.

## Invariants

- **Ownership is by `workflows.filePath`**: `project-<projectId>-<uuid>.yaml`, or legacy `group-<projectId>.yaml` (`isProjectOwnedWorkflow`). Removing a binding or the project deletes owned workflows (runs cascade). A bound workflow that is not owned is only unbound. Only owned workflows can be edited here. Templates are the workspace's `isCanEdit = false` workflows.
- **The workflow file is the trigger definition.** `content.on` (see `workflow-on.ts`) defines the triggers. Rows in `project_workflow_triggers` are synced from it (`planTriggerSync`, `syncWorkflow`) and hold only state (`enabled`, `lastFiredAt`, `schedulerId`). Trigger CRUD rewrites `on:` (`writeOn`). Project workflows never keep `on.target`.
- **Archived = read-only.** Every mutating path calls `findProjectOrFail(..., { writable: true })` (400). Archive unregisters schedulers; unarchive registers them again; event triggers and cron fires of archived projects do nothing.
- Hand-picked assets are never removed by rules. Adding an asset by hand turns its rule row into `manual`. Excludes alone select nothing (`scopeRulesSql` returns null without an include).
- Discovery only adds to projects with `autoAddAssets` that are not archived. Inserts use `ON CONFLICT DO NOTHING`, and only the ids actually added are reported, so redeliveries add nothing.
- Runs stay pinned to project assets: `startBindingRun` filters `assetIds` to the project (400 when none are left) and requires every root tool to be installed.
- Event triggers batch in Redis (`project-trigger:<id>:pending | queued | causes`): one delayed job per open window (`windowMinutes`, default 10), then one run per `maxAssets` (default 200) of the assets still in the project. A chain stops past `MAX_CHAIN_DEPTH = 3`. A workflow's own run cannot trigger that workflow again, except through `project.assets.added`.
- `create` is not one transaction. On failure, `removeEverything` undoes schedulers, workflows and the project.

## Coupling

- Imports `ConnectorsModule` and `ArtifactsModule`; uses the global `EventBridgeService`, `WorkflowsService` (saves project pipeline edits), `WorkflowRunnerService` (jobs-registry) and `RedisService`.
- `event-bridge/sinks/projects/projects.sink.ts` defines the two tokens and fact types this module implements.
- Agent tools (`agents/tools/project*.tools.ts`, `agents.tools.ts`, `agents.completions.ts`) call these services and `findProjectOrFail` directly, and publish `project.*` events themselves.
- Other modules query project tables with raw SQL: `vulnerabilities.service.ts`, `targets/target-overview.service.ts`, `assets/asset-filter.ts`. `templates.service.ts` injects the `ProjectAsset` repository. `provenance.ts` exports (`RUN_STATUS_SQL`, `SEVERITY_RANK_SQL`, `VulnerabilityProvenance`) are used by vulnerabilities and targets.
- `TriggerWorkflowService` (workflows) skips `project-%` / `group-%` workflows, so target events never run project workflows.

## Gotchas

- `ProjectTriggersService.onApplicationBootstrap` runs `reconcileSchedulers`, which removes **every** scheduler in the queue that is not an enabled cron trigger in the connected database. A boot against another database on the same Redis (an e2e or branch run) wipes the real schedules. Give such runs their own Redis db.
- Do not rename the queue value `asset-groups-workflow-schedule`: reconciliation would register everything on the new queue and nothing would clear the old one.
- `CreateProjectDto.schedule` is the pre-`on` single cron. It is ignored when `on` is given.
- A connector secret the client sends back unchanged (stored ciphertext or its mask) keeps the stored value in `buildToolJobs`.

## Testing

Specs: `projects.service`, `projects.controller`, `project-workflows.service`, `project-triggers.service`, `project-scope.service`, `project-files.service`, `project-run-events.listener`, `pipeline`, `provenance`, `scope-rules`, `workflow-on`, `dto/create-project.dto`, `dto/project-trigger.dto`. There are none for `project-assets.service.ts` or `project-results.service.ts`.
