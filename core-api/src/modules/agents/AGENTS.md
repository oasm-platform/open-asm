# agents module

The AI chat agent: LLM connections, conversations streamed over SSE, the tool set the model calls (workspace data, projects, worker commands, connectors), the command/plan approval flow, background subagents, memories, skills, custom agent definitions and external MCP servers.

## Layout

- `agents.module.ts`: `@Global()`. Registers every entity below plus `Project`.
- `agents.controller.ts`: all HTTP routes under `agents/`, including the SSE writer and the resume stream.
- `agents.service.ts` (`AgentsService`): LLM config CRUD, conversation/message reads and deletes, workspace MCP config CRUD + ping, the `PROJECT_DELETING_EVENT` listener.
- `agents.completions.ts` (`AgentsCompletionsService`, ~3000 lines): one chat turn (`streamMessage`), the continuation loop (`createContinuationStream`), system prompt assembly (`buildSystemContext`), compaction, title/goal generation, `vulAnalyze`, and the in-memory run registry (`activeRuns`).
- `agents.tools.ts` (`AgentTool`): builds the tool set from `tools/*` and wraps each tool in the guard + approval gate (`withApproval`). Holds `WORKSPACE_TOOLS`, `PROJECT_ACTION_TOOLS`, `MCP_TOOLS`, `READ_ONLY_TOOLS`, `SELF_GATED_TOOLS`.
- `agents.guard.ts` (`AgentsGuardService`): code-enforced checks before approval (`evaluate`) plus `agent_tool_rules` CRUD. Pure matchers in `guard/`: `command-deny.ts` (built-in deny list, `matchBuiltinDeny`), `target-scope.ts` (`parseScopeTarget`, `scopeVerdict`, `hostsInCommand`), `tool-rules.ts` (`matchToolRule`).
- `tools/`: one file per tool family (workspace lookups, project read/build, `remote-execute.tool.ts`, `connector.tools.ts`, `plan.tools.ts`, `memory.tools.ts`, `artifact.tools.ts`, `web-fetch.tool.ts`, `vulnerability-proposal.tool.ts`). `tools/types.ts` has `AgentToolDeps` / `ToolScope`; `tools/helpers.ts` has `currentToolName` (renamed tool aliases).
- `agents.approvals.ts`: per-command and per-plan approval prompts.
- `agents.subagents.ts`: background subagent queue, runner and the `dispatch_subagent` / `get_subagent_result` / `wait_for_subagents` / `continue_subagent` / `cancel_subagent` tools.
- `agents.workflow.ts` (`AgentsWorkflowService`): structured briefs (`renderBrief`), the subagent `submit_result` tool, the shared notebook (`agent_workflow_notes`, `add_workflow_note` tool, `buildRunContext`) and the workflow snapshot (`getWorkflow`).
- `agents.definitions.ts`: built-in agents from `builtin-agents/*.md` (YAML frontmatter + prompt) and custom ones from `agent_definitions`.
- `agents.skills.ts`: built-in skills from `skills/<name>/SKILL.md` plus workspace skills, `load_skill` tool.
- `agents.config.ts`: per-user agent settings, default-model resolution (`findDefaultLLMConfig`, `withAgentConfig`), `withoutDisabledTools`, `createLanguageModel`.
- `agents.mcp.ts`: lists tools from the workspace's external MCP servers. `agents.memories.ts`: STM (Redis) and LTM (DB). `agents.stream-buffer.ts`: Redis replay buffer for SSE. `agents.usage.ts`: raw-SQL usage report. `agents.models-catalog.ts` + `shared/models-dev.ts`: context window, cost and reasoning efforts from `resources/models-dev/catalog.json` (refresh with `task api:models:snapshot`).
- `llm-provider-supported.ts`: provider list (`llmProviderSupported`), model handlers and model fetchers.
- `prompts/*.md`: Mustache templates loaded at boot (`SYSTEM.md`, `ASK.md`/`AGENT.md` picked by `agentMode.toUpperCase()`, `PLAN.md`, title/goal/summary/vuln prompts).
- `shared/`: context budget, step limit, token counter, turn stats, `updateConversationMetadata`.

## Public surface

All routes: `@Controller('agents')`, `AuthGuard`, `@WorkspaceAccess('agent.read' | 'agent.write')`.

| Route | Permission |
|---|---|
| `GET modes`, `providers`, `providers/connected`, `llm-configs/:id/models`, `usage` | `agent.read` |
| `POST llm-configs`, `PATCH/DELETE llm-configs/:id`, `PATCH llm-configs/:id/set-preferred` | `agent.write` |
| `GET conversations`, `conversations/:id`, `conversations/:id/messages`, `conversations/:id/subagents[/:subagentId]`, `conversations/:id/workflow` | `agent.read` |
| `POST conversations/:id/subagents/:subagentId/cancel` | `agent.write` |
| `PATCH/DELETE conversations/:id`, `DELETE conversations`, `DELETE conversations/:cid/messages/:mid` | `agent.write` |
| `POST messages/stream` (SSE) | `agent.read` (sending a chat message needs only read) |
| `GET conversations/:id/stream` (resume SSE, 204 when nothing to resume) | `agent.read` |
| `POST conversations/:id/stop` | `agent.write` |
| `GET/PATCH/DELETE command-approvals[/:id]`, `PATCH plan-approvals/:id` | read for GET, `agent.write` otherwise |
| `GET mcp-configs`, `GET mcp-configs/:name/ping` / `PUT/DELETE mcp-configs/:name`, `PATCH mcp-configs/:name/toggle` | `agent.read` / `agent.write` |
| `GET/PUT config` | `agent.read` / `agent.write` |
| `GET workspace-memory` / `DELETE workspace-memory/:id` | `agent.read` / `agent.write` |
| `GET/POST definitions`, `PATCH/DELETE definitions/:id` | read / write; only the creator edits |
| `GET/POST skills`, `PATCH/DELETE skills/:id`, `PATCH skills/:id/toggle` | read / write; writes also require workspace owner (`getWorkspaceByIdAndOwner`) |
| `GET/POST tool-rules`, `PATCH/DELETE tool-rules/:id` | read / write; writes also require workspace owner |

- Exports `AgentsService`, `AgentTool`, `AgentsCompletionsService`, `AgentsMemoriesService`, `AgentsMcpService`, `AgentsSkillsService`, `AgentsApprovalsService`, `AgentsModelsCatalogService`, `AgentsSubagentsService`, `AgentsDefinitionsService`.
- SSE chunks are AI SDK UI message chunks plus custom `data-*` parts: `data-todos-updated`, `data-remote-execute-output`, `data-browser-screenshot`, `data-approval-required`, `data-approval-resolved`, `data-approval-mode-changed`, `data-subagents-updated`, `data-conversation-created`, `data-conversation-stats`. The console parses these names.
- Consumes `PROJECT_DELETING_EVENT` (Nest `@OnEvent`) to clear STM and approvals of the project's chats. Publishes `project.created/updated` and `tool.installed` audit events through `EventBridgeService.publishSafely` from `tools/project-build.tools.ts` (actor type `Agent`).
- No BullMQ queue, no gRPC, no cron. Subagents use the `agent_subagents` table as their queue.

## Data model

- `agent_llm_configs` (`AgentLLMConfig`): per **user** per workspace; `apiKey` encrypted with the workspace DEK (fallback `encrypt()` when no DEK). Cascades on workspace and user delete.
- `agent_configs` (`AgentConfig`): unique (`workspaceId`, `userId`). `modelsConfig` jsonb (`default`, `small`, `subagents[]` refs to the user's own LLM configs), `searchProviders` jsonb with DEK-encrypted `apiKey`, `disabledTools`, `memoryEnabled` (default `false`). Both secret columns are listed in `SECRET_COLUMNS` of `encryption-upgrade.service.ts`.
- `agent_conversations` (`AgentConversation`): does **not** extend `BaseEntity`; `id` is a plain `@PrimaryColumn` so the client-generated id from `SendMessageDto.conversationId` becomes the row id. No FK to workspace or user (`workspaceId`, `createdBy` are bare columns); `projectId` FK cascades. `summary` (compaction), `workerId` (pinned worker), `metadata` jsonb (model, window, totals, goal).
- `agent_messages` → conversation (cascade); `parts` jsonb keeps the real order of reasoning/tool/text; streaming placeholders have `metadata.status = 'streaming'`. `agent_message_tool_calls` → message and conversation (cascade).
- `agent_conversation_todos` (the plan) and `agent_subagents` → conversation (cascade); both have a `@VersionColumn`. `agent_subagents.metadata` (`SubagentMetadata`) also holds the workflow fields: `brief`, `stepId` (plan step it serves, defaults to the step in progress at dispatch), `after` (ids it waits for), `derivedFrom` (the `from` of `dispatch_subagent`: earlier subagents whose results led to it, provenance for the workflow graph only), `continuesFrom`, `maxSteps` and `output` (the `submit_result` hand-back). Old rows simply lack them.
- `agent_workflow_notes` (`AgentWorkflowNote`) → conversation (cascade); append-only (fact / decision / issue, `author` = subagent name or `main`). `subagentId` and `stepId` are plain uuids, no FK.
- `agent_command_approvals`: unique (`userId`, `hash`), hash = SHA-256 of `conversationId\0command`; no FKs, so `forgetConversations` deletes them by hand.
- `agent_definitions`: unique (`workspaceId`, `createdBy`, `name`) and partial unique (`workspaceId`, `name`) where `scope = 'workspace'`. `agent_skills`: unique (`workspaceId`, `name`). `agent_mcp_configs`: one row per workspace, servers in `configJson.mcpServers`. `agent_workspace_memories`: LTM records per user.
- `agent_tool_rules` (`AgentToolRule`): workspace-wide; `toolName` (`*` glob), `pattern` (null = every call; else a case-insensitive wildcard pattern, `*` any run and `?` one character, that must match the whole command or JSON input; see `wildcardMatch`), `action` allow/deny/ask, `priority`, `enabled`. Workspace cascade, `createdBy` SET NULL.
- No soft delete anywhere.

## Invariants

- **Conversations are private to their creator.** Every read/write filters `workspaceId` + `createdBy = userId` and returns 404 otherwise. `getOrCreateConversation` refuses (404) an existing id owned by another member instead of reusing it. LLM configs and agent config are per user too; MCP configs and skills are workspace-wide.
- **A run outlives its HTTP request.** The controller keeps draining the stream after the client disconnects; only `POST conversations/:id/stop` (or a newer run on the same conversation via `registerActiveRun`) aborts it. `running` comes from `isRunActive` (in-memory) or `AgentsStreamBufferService.isStreaming` (Redis).
- **Approval gate.** `AgentTool.getTools` wraps every tool in `withApproval` when `approval` is passed; `execute_remote_command` gates itself on the raw command. AUTO mode and `READ_ONLY_TOOLS` pass; MANUAL asks. In Agent mode (`planning === 'track'`) every gated tool is refused until a `formulate_plan` plan is approved and a step is `in_progress` (`needsTodo`). Approving a plan switches the run's approval mode.
- **Guard before approval, in every mode (AUTO too).** `AgentsGuardService.evaluate` runs in `withApproval` and in `remote-execute.tool.ts`, in this order: (1) built-in deny list (`execute_remote_command` and external MCP tools only); (2) the highest-priority `agent_tool_rules` match (deny refuses; ask forces the approval card via `ApprovalToolMeta.escalate`; allow skips the prompt via `preApproved`); (3) scope gate: `run_tool_connector.target` and `dispatch_subagent.targets` must be in scope or the call is refused; hosts read from a shell command (`hostsInCommand`, best effort) that are out of scope escalate to ask unless an allow rule matched; excluded hosts are always refused. Scope = the project's include/exclude rules when the conversation's project has an include rule, else the workspace DOMAIN/IP/CIDR targets (a domain covers its subdomains); exact asset values of that scope also count. Block beats allow. Refusals return `{ error, policy }`, so the policy lands in `agent_message_tool_calls.result`.
- Subagents run with `ApprovalSettings.unattended`: an escalated call is refused (`UNATTENDED_MESSAGE`) instead of waiting on a prompt nobody sees.
- Without `approval` (e.g. `vulAnalyze`) tools run ungated, except `execute_remote_command` (refuses) and project-build tools (refuse without `scope.userId`). Project-build, `save_file` and `save_template` tools re-check the member's workspace permission (`project.write`, `target.write`, `workspace.write`, `artifact.write`).
- `MCP_TOOLS` feeds the OASM MCP server (`src/mcp`), which has no approval flow: only read-only tools may be listed there, and `getMcpTools` also intersects with `READ_ONLY_TOOLS`.
- A conversation with `projectId` locks every project-aware tool to that project (`ToolScope.projectId`).
- Subagents: a custom definition in a non-AUTO conversation gets read-only tools only; built-in definitions and AUTO conversations get their declared write/exec tools, auto-approved. Subagents never get subagent tools or LTM. The task is wrapped in `<task>`, preceded by `<upstream_result>` blocks (results of its `after` rows) and a `<workflow_context>` (newest notebook entries, capped by `WORKFLOW_CONTEXT_MAX_CHARS`); closing tags of all of them are neutralized (`neutralizeTags` in `agents.workflow.ts`).
- A pending row is claimed only when none of its `after` rows is pending or in progress (`claimNext`); a failed or cancelled dependency still releases it. Dependencies, `derivedFrom` and `continuesFrom` must be rows of the same conversation, checked at dispatch under the conversation lock, so cycles cannot form.
- `dispatch_subagent` takes a structured brief (`objective`, `expected_output`, `context`, `must_do`, `must_not`); the rendered text goes to the `task` column, so readers of `task` (UI, `vulnerability-review.service.ts`) keep working. `submit_result` facts and open questions are written to the notebook when the run completes.
- Agent definition names: built-in names are reserved, and a personal agent may not shadow a workspace one (and vice versa) so `@name` resolves to one agent.
- Tool-name renames go in `RENAMED_TOOLS` (`tools/helpers.ts`) so saved `disabledTools` and definition `tools` keep working.

## Coupling

- Imports `AssetsModule`, `ArtifactsModule`, `TargetsModule`, `TemplatesModule` (for `save_template`), `RemoteExecuteModule`, `WorkersModule`, `ConnectorsModule`, `ProjectsModule`, `HttpModule`, and `forwardRef` to `VulnerabilitiesModule` and `StatisticModule` (cycle Statistic → Vulnerabilities → Agents → Statistic). `AgentTool` also injects `VulnerabilitiesService`, `VulnerabilityReviewService`, `IssuesService`, `ToolsService`, `WorkersService`, `JobsRegistryService` with `forwardRef`; issues/tools/jobs-registry/workspaces/event-bridge come from global modules.
- `VulnerabilitiesModule` imports this module with `forwardRef` and calls `AgentsCompletionsService.vulAnalyze`. `src/mcp/mcp.module.ts` imports it for `AgentTool.getMcpTools`.
- Direct table access from outside: `workers/remote-execute-subscribe.service.ts` writes `agent_conversations.workerId` (sticky worker pin); `assets/assets.service.ts` registers `AgentLLMConfig`/`AgentConfig`, calls `findDefaultLLMConfig` and reads `prompts/GENERATE_SERVICE_TAGS.md` from this folder; `vulnerabilities/vulnerability-review.service.ts` runs raw SQL on `agent_message_tool_calls` and `agent_subagents` and reads the tool-output Redis keys; `vulnerability-source.entity.ts` has an FK to `AgentConversation` (`SET NULL`). Check these when changing those entities.

## Gotchas

- Several pieces of state live in process memory: `activeRuns`, pending command/plan prompts (`AgentsApprovalsService.pending` / `pendingPlans`), compaction joins. With more than one API instance, stop and approve/decide only work on the instance running the turn. "Allow all"/"allow tool" for a conversation live in Redis (`agents:approval:*`, 7-day TTL); approvals time out after `APPROVAL_TIMEOUT_MS` (5 min).
- The workflow snapshot (`GET conversations/:id/workflow`) has no SSE of its own: the console refetches it when `data-subagents-updated` or `data-todos-updated` changes something.
- Subagents run in-process (`SUBAGENT_MAX_CONCURRENCY = 4`), claimed with `FOR UPDATE SKIP LOCKED`, heartbeat every 30 s; `recoverStale` requeues or fails rows without a heartbeat (sweep every 30 s and on boot). Cancelling elsewhere is seen at the next heartbeat.
- Use `streamText`, never `generateText`, for one-shot completions: some OpenAI-compatible providers return SSE-framed bodies to non-streaming requests (`completeText` explains this).
- Prompts, built-in agents and skills are read from `__dirname` at boot; `nest-cli.json` copies `**/*.md`. Any `.md` dropped into `prompts/` or `builtin-agents/` is loaded; a `SKILL.md` in a new `skills/<dir>/` becomes a built-in skill.
- `load_skill` resolves a built-in skill before a workspace skill of the same name, and `createUserSkill` does not reject built-in names, so such a user skill is shadowed.
- `save_template` (`tools/artifact.tools.ts`) writes nuclei templates through `TemplatesService.create` / `saveContent`, so they land in the workspace `custom-templates` folder with the same validation as the HTTP routes; `save_file` writes to the user's Files root and is not runnable as a template. The built-in `nuclei-template-generator` skill tells the model to use `save_template`.
- MCP: `isSafeUrl` (private-range block) is applied only by `pingMCPServer`; `AgentsMcpService` connects to whatever URL is saved. External tools are named `<server>_<tool>` and built-in tools win on a name clash.
- Every non-empty stdout of `run_tool_connector` / `execute_remote_command` is stored under `agent:tool-output:<conversationId>:<runId>` for 1 h (`tools/tool-output-store.ts`, written by `pageForModel`), not only truncated ones: `read_tool_output` pages it and `propose_vulnerability` quotes are checked against it (`evidence.citations`, see the vulnerabilities module). stderr is not stored. Subagents share the parent's conversation id, so the main agent can cite a subagent's runId.
- Redis keys: STM `agents:stm:<conversationId>` (24 h TTL), stream buffer `agent:stream:<id>` + channel `agent:stream:chan:<id>`, model lists `agents:models:<configId>` (1 h). Deleting a conversation must also clear STM and approvals (see `deleteConversation`).
- Guard: rules are cached per workspace for 30 s (`RULES_TTL_MS`) and dropped on CRUD on that instance only. Host names are never resolved, so an IP target does not cover its domain and vice versa. Rule patterns are wildcards, never regexes built from user input (no ReDoS); the subject is capped at `RULE_SUBJECT_MAX` and only workspace owners write rules. A deny on a word anywhere needs `*word*`. The deny list reads the command with quotes stripped, so it also refuses e.g. `grep "DROP TABLE"`. Not covered: `retrieve_web_page`, nuclei `templates`, built-in tools other than the two with structured targets.
- Long-term memory is opt-in: with `memoryEnabled = false` the `ltm_*` tools are removed and LTM is left out of the prompt.

## Testing

Specs are colocated: `agents.*.spec.ts` (approvals, config, controller, default-model, definitions, guard, memories, message-parts, models-catalog, plan, service, skills, stream-buffer, subagents, tools, usage, worker-scope, workflow), `guard/*.spec.ts`, `tools/*.spec.ts`, `shared/*.spec.ts`, `dto/dto-validation.spec.ts`, `llm-provider-supported.orcarouter.spec.ts`. No e2e spec covers this module.
