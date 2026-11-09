# issues module

Workspace work items (`#no` per workspace), linked to findings, assets, targets, projects or runs. Issue rules turn finding events into remediation issues, and the remediation type resolves and reopens itself as its findings change.

## Layout

- `issues.controller.ts`: two controllers, `IssueRulesController` (`issues/rules`) and `IssuesController` (`issues`).
- `issues.service.ts`: `IssuesService`: CRUD, `changeStatus`, links, list (`getMany`) and detail (`getById`).
- `issue-activity.ts`: shared helpers used by every writer: `nextIssueNo`, `writeSystemComment`, `IssueEventsPublisher`, `insertLinks`, `uniqueLinks`, `assertWorkspaceMember`, `isUniqueViolation`, `ACTIVE_ISSUE_STATUSES`.
- `issue-links.service.ts`: `IssueLinksService`: per-type, workspace-scoped resource lookup (`RESOURCE_QUERIES`) and summaries.
- `issue-automation.service.ts`: `IssueAutomationService`, the entry point for finding events.
- `handlers/`: `IssueTypeHandler` interface, `IssueTypeHandlerRegistry`, `VulnerabilityRemediationHandler` (`finishedVulnerabilitySql`), `ManualIssueHandler`/`TaskHandler`.
- `rules/`: `IssueRuleEngine`, `IssueRulesService` (`DEFAULT_ISSUE_RULE`), `issue-rule-matching.ts` (`groupKeyFor`, `matchesConditions`, `derivePriority`).

## Public surface

| Route | Permission |
|---|---|
| `GET issues`, `GET issues/:id`, `GET issues/rules` | `workspace.read` |
| `POST issues`, `PATCH issues/:id`, `PATCH issues/:id/status`, `POST issues/:id/links`, `DELETE issues/:id/links/:linkId`, `DELETE issues/:id` | `workspace.write` |
| `POST issues/rules`, `POST issues/rules/defaults`, `PATCH/DELETE issues/rules/:id` | `workspace.write` |

- There are no `issue.*` permission keys; issues use the `workspace.*` keys. Comment routes (`issues/:issueId/comments`) live in the `comments` module.
- `IssueRulesController` is listed before `IssuesController` in `controllers` so `issues/rules` is not matched as `issues/:id`. Keep that order.
- `@Global()`, exports `IssuesService` and the `ISSUE_VULNERABILITY_EVENTS` token (`useExisting: IssueAutomationService`).
- Events: every one is published from a service through `IssueEventsPublisher.publish` (no `@PublishEvent`). They are `issue.created|updated|assigned|opened|closed|resolved|deleted`, `issue.link.added|removed`, and subject `workspace:<id>/issue:<id>`. Automation publishes as actor `system`.
- Consumed: the event bridge's `IssuesSink` (`event-bridge/sinks/issues/issues.sink.ts`, consumer group `issues`) passes `vulnerability.detected|resurfaced|fixed` to `IssueAutomationService.onVulnerabilityEvent`. `detected` → rule engine. `resurfaced` → handlers (reopen) and then rules. `fixed` → handlers (auto-resolve).
- Agent/MCP tools: `enumerate_open_issues` (`getMany`), `inspect_issue` (`getById`) in `agents/tools/workspace.tools.ts`.

## Data model

- `issues`: unique `(workspaceId, no)`; partial unique `IDX_issues_open_groupKey` on `(workspaceId, type, groupKey)` where `groupKey IS NOT NULL AND status IN ('open','in_progress')`. `ruleId` and `assigneeId` SET NULL; workspace CASCADE. Hard delete. `workspaceId` is nullable in the entity, but every code path sets it.
- `issue_counters`: last number per workspace. Numbers are never reused after a delete.
- `issue_links`: **polymorphic** (`resourceType` + `resourceId`, no FK to the resource), unique `(issueId, resourceType, resourceId)`, CASCADE from issue. Readers must accept links to deleted resources (`summarize` returns `{ missing: true }`, and progress ignores them).
- `issue_rules`: `event` must be in `ISSUE_RULE_EVENTS` (`vulnerability.detected`, `vulnerability.resurfaced`). `issueType` can only be `vulnerability_remediation`. `groupBy` is `vulnerability_name|asset|target|none`.
- Comments are in the `comments` table (`Comment.issueId`, cascade on issue delete).

## Invariants

- Always number issues with `nextIssueNo(manager, workspaceId)` inside the inserting transaction. It upserts `issue_counters` (seeded from `MAX(no)` the first time) and row-locks it until commit.
- **System comments are written here, not through `CommentsService`**: `writeSystemComment` saves a `Comment` with `isCanEdit/isCanDelete = false`, signed by `BOT_ID` for automation or by the user for a manual status change. Every `changeStatus` and every automatic resolve/reopen writes one in the same transaction. If you change the `Comment` entity, check this function.
- Tenant scoping: issues carry `workspaceId` (`findInWorkspace`). Link targets are checked by `IssueLinksService.assertInWorkspace`, with each type scoped by its own path (vulnerability → asset → target, run → workflow or project). Assignees must be workspace members (400 otherwise).
- Resolved/closed need a `resolution`; going back to open or in progress clears it and `resolvedAt`.
- The rule engine only takes **open, approved** findings (`openVulnerabilityCondition`), skips findings already linked to an open or in-progress issue, joins the open issue with the same `groupKey` or opens one, and only ever raises a derived priority or pulls `dueAt` earlier. A unique violation is retried once (`attempt`), joining the issue the other delivery created.
- Remediation automation changes status with a conditional `UPDATE … WHERE status = <read status>`, so a redelivered event is a no-op. A reopen that hits the open-groupKey index is logged and skipped. A manual `changeStatus` that hits the index returns 409.

## Coupling

- Registers its own repositories plus `Comment`. Imports no domain modules: it reads `vulnerabilities`, `vulnerability_dismissals`, `assets`, `targets`, `projects`, `job_histories` and `workflows` with raw SQL.
- `VulnerabilitiesService.openIssues` and `TargetOverviewService` read `issues` / `issue_links` directly.
- `asset_review` and `scan_failure` types have no automation yet (`ManualIssueHandler`). A new automated type needs an `IssueTypeHandler` registered in `IssueTypeHandlerRegistry`.

## Testing

Unit specs: `issues.service.spec.ts`, `issues.controller.spec.ts`, `handlers/vulnerability-remediation.handler.spec.ts`, `rules/issue-rule-engine.service.spec.ts`, `rules/issue-rules.service.spec.ts`. E2E: `core-api/test/issues.e2e-spec.ts`.
