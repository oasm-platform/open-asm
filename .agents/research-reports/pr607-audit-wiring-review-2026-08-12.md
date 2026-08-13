# PR #607 Review — Audit Wiring (core-api, slice)

Date: 2026-08-12. Branch feat/audit-log → main. Read-only review. Scope: audit wiring across workspaces, reports, jobs-registry, integrations, workflows, asset-group, internal-networks, targets, vulnerabilities + audit-wiring specs.

## Verdict: APPROVE-WITH-COMMENTS

No blocking issues. In-tx atomicity for the 6 critical events, actor context from request, secret handling, typed catalog, behavior-asserting specs. See findings.

## Findings

- **MEDIUM** — No test enforces "every catalog action has an emission point". S11 (audit.service.spec.ts:272) asserts controller/method existence + guard keys for the 12 workspaces events only; M4.x specs assert decorators with hardcoded action strings; the explicit writes are covered only by their service/controller specs. A NEW catalog entry with zero wiring passes CI (today: 3 dead labels). Also: S11 guard assertion covers only workspaces — a decorated handler on an unguarded route would silently write nothing (interceptor requires req.workspaceId, audit.interceptor.ts:64-67) and no spec would fail.
- **MEDIUM** — Delete-event payloads mislabel before-state as `after`: workspaces.service.ts:380 `changes: { name: { after: workspace.name } }` (workspace.deleted), workspaces.service.ts:1007 (permission_group.deleted). Consumers reading `changes.name.after` get the pre-delete value. Use `before`.
- **LOW** — Decorator-wired DELETE events record no resourceId: report.deleted (reports.controller.ts:174), workflow.deleted (workflows.controller.ts:164), asset_group.deleted (asset-group.controller.ts:208), network.deleted (internal-networks.controller.ts:189), integration.disconnected (integrations.controller.ts:186). Route params unreachable from interceptor config fns — documented for invitations (workspaces.controller.ts:424-427) but silently missing elsewhere. Audit rows can't be linked to the deleted entity.
- **LOW** — deleteWorkspace behavior change outside audit framing: new findOne → 404 (workspaces.service.ts:358-362); previously silent 200 on missing workspace. Guard produces 403 first in practice. Also deleteAllTargetsFromWorkspace runs in its own tx before the workspace-delete tx (workspaces.service.ts:367) — targets/workspace delete not atomic (pre-existing).
- **LOW/INFO** — Denied outcomes never recorded: guards throw before the interceptor runs; AuditOutcome.Denied (enum.ts) is dead code. 403 attempts leave no trail.
- **INFO** — audit.exported written before the stream flushes (audit-events.controller.ts:167-174); client disconnect mid-stream still logs "exported".
- **INFO** — Interceptor evaluates changes/metadata pre-handler on raw body (audit.interceptor.ts:57-58), re-evaluates in tap (70-71); Failure events carry raw-body-derived values. All fns defensive; harmless.
- **INFO** — rotateApiKey result (plaintext new key) safe: no config fns echo result (workspaces.controller.ts:571-573). workspace.config.updated logs no config payload. Future config fns on these handlers must not touch result/body config.
- **INFO** — member.invitation.cancelled + job.cancelled lack resourceId (route params unreachable); documented (jobs-registry.audit-wiring.spec.ts:20-25). Fix needs routeParam support in AuditLogConfig.
- **INFO** — removeMember metadata.targetUserId (workspaces.service.ts:1249) not swept by pseudonymizeActor (only actorName/Email/sourceIp, audit.service.ts:216-231).
- **INFO** — requestIdMiddleware honors client X-Request-Id (UUID-validated, request-id.middleware.ts:24-29); correlation spoofable, auth unaffected.

## Non-audit regression check

- workspaces.controller.ts +73: all audit (decorators, @Req, buildActorContext pass-through). No endpoint change.
- workspaces.service.ts: tx wrappers preserve semantics; 23505 race path re-tested against manager.save (workspaces.service.spec.ts:734-737). Behavior change: deleteWorkspace 404 (above).
- targets/vulnerabilities: audit-only additions. `repo.delete(id)` in deleteTarget not workspace-scoped — PRE-EXISTING, untouched.
- Guard parity: all 32 live events resolve to guarded handlers; workspace.created is the documented exception (workspaceId from result).

## Wiring table (35 catalog entries)

| action | controller.method | resolvable | write path | notes |
|---|---|---|---|---|
| workspace.created | WorkspacesController.createWorkspace | yes | interceptor (fire-and-forget) | workspaceId from result; name changes |
| workspace.updated | WorkspacesController.updateWorkspace | yes | interceptor | also makeArchived (same action) |
| workspace.deleted | WorkspacesController.deleteWorkspace | yes | recordInTx (explicit) | atomic w/ row delete; name in `after` |
| workspace.config.updated | updateWorkspaceConfigs | yes | interceptor | no config logged (safe) |
| workspace.api_key.rotated | rotateApiKey | yes | interceptor | result w/ plaintext key not logged |
| member.invited | createInvitations | yes | interceptor | emailsCount only |
| member.invitation.cancelled | cancelInvitation | yes | interceptor | no resourceId (documented) |
| member.removed | removeMember | yes | recordInTx + pseudonymize post-commit | atomic |
| member.permissions.updated | updateMemberPermissions | yes | recordInTx | before/after group ids |
| permission_group.created | createPermissionGroup | yes | recordInTx | atomic |
| permission_group.updated | updatePermissionGroup | yes | recordInTx | before/after permissions |
| permission_group.deleted | deletePermissionGroup | yes | recordInTx | name in `after` |
| target.created | TargetsController.createMultipleTargets | yes | interceptor | values from body |
| target.updated | TargetsController.updateTarget | yes | interceptor | scanSchedule only |
| target.deleted | TargetsController.deleteTarget | yes | auditSafely (explicit) | before-values from entity; after delete |
| asset.deleted | AssetsController.deleteAsset | **NO — dead label** | none | no endpoint in v1 (documented) |
| asset_group.created | AssetGroupController.create | yes | interceptor | name changes |
| asset_group.deleted | AssetGroupController.delete | yes | interceptor | no resourceId |
| network.created | InternalNetworksController.createInternalNetwork | yes | interceptor | name changes |
| network.deleted | InternalNetworksController.deleteInternalNetwork | yes | interceptor | no resourceId |
| vulnerability.status.updated | bulkDismissVulnerabilities | yes | interceptor | metadata action+count |
| vulnerability.bulk_updated | bulkReopenVulnerabilities | yes | interceptor | metadata action+count |
| report.generated | ReportsController.generateSummaryReport | yes | interceptor | reportType metadata |
| report.exported | ReportsController.previewSummaryReport | yes | interceptor | format: pdf |
| report.deleted | ReportsController.deleteReport | yes | interceptor | bare |
| job.cancelled | JobsRegistryController.cancelJob | yes | interceptor | bare; jobId unreachable (documented) |
| workflow.created | WorkflowsController.createWorkflow | yes | interceptor | resourceId from result |
| workflow.updated | WorkflowsController.updateWorkflow | yes | interceptor | resourceId from result |
| workflow.deleted | WorkflowsController.deleteWorkflow | yes | interceptor | bare |
| integration.connected | IntegrationsController.createIntegration | yes | interceptor | whitelist changes; secrets stripped+tested |
| integration.disconnected | IntegrationsController.deleteIntegration | yes | interceptor | bare |
| integration.settings.updated | IntegrationsController.updateIntegration | yes | interceptor | whitelist changes; secrets stripped+tested |
| api_key.created | ApiKeysController.create | **NO — dead label** | none | controller empty (documented) |
| api_key.revoked | ApiKeysController.revoke | **NO — dead label** | none | controller empty (documented) |
| audit.exported | AuditEventsController.exportAuditEvents | yes | auditSafely (explicit) | rowCount; pre-stream |

32/35 live; 3 dead labels served to the UI (asset.deleted, api_key.created, api_key.revoked), all documented in NOT_YET_RESOLVABLE (audit.service.spec.ts:70).

## Spec quality (focus 4)

Specs assert real behavior, not presence: decorator + exact action + config fn outputs for body and undefined result + negative cases (unwired handlers stay clean, e.g. audit-wiring-m4-3.spec.ts:54-65) + secret-stripping assertions (integrations.controller.audit.spec.ts:28-38,70-91) + in-tx recordInTx assertions (workspaces.service.spec.ts M4.1 block) + interceptor end-to-end S12a-h (audit.interceptor.spec.ts). Action strings are compile-time-typed as AuditAction — decorator↔catalog drift impossible. Minor gap: integrations spec lacks a negative "unwired handlers not decorated" test.
