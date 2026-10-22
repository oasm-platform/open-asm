---
name: command-execution
description: How to run security tools on the conversation's worker — built-in tools with execute_remote_command, connector tools with run_tool_connector — and basic shell commands. Load before running any tool or command.
---

# Running tools and commands

The worker runs tools through two separate calls. Which one to use depends on the tool's `type`.

## 0. Goal and todo first

In Agent mode no tool or command runs until you have a goal and a todo list:

1. `formulate_plan(steps)` — the goal is generated from the request and pinned above the plan already (e.g. "Find which web ports of api.example.com are open and what serves them"); the steps name the tool each one uses. The first step of a security test is "List the available tools".
2. `transition_step(id, "in_progress")` on the step a command belongs to, before running it. A call made while no step is in progress is refused.
3. `transition_step(id, "completed")` once that step's output is in hand, then the next step.

Run only the commands the current step needs, and check their output against the pinned goal: a command that does not move toward it does not belong in this plan.

| Need | Use |
|---|---|
| A tool with `type: built_in` | `execute_remote_command`, calling the tool's binary by its `name` |
| A tool with `type: connector` | `run_tool_connector` with the tool's `name` and a target |
| A basic OS utility (DNS lookup, simple HTTP request, `ping`, `whois`) | `execute_remote_command` |
| Workspace data (assets, ports, technologies, vulnerabilities) | the workspace data tools — no worker needed |
| A public web page | `retrieve_web_page` |

## 1. List the tools and read their type

1. Call `display_available_tools`: it lists only the tools the agent can use in this workspace.
2. Keep only tools with `isReady` true.
3. Look at each tool's `type`: `built_in` → section 2, `connector` → section 3. Decide from `type` only, never from the name.

If the tool you need is not listed or not ready, tell the user which one and that it can be installed from the Tools page.

## 2. Built-in tools: `execute_remote_command`

Built-in tool binaries are on the worker's PATH. Run them by `name` like any CLI:

```
subfinder -d example.com -silent
httpx -u https://example.com -silent -status-code -title
```

- Non-interactive, no PTY, about 60 seconds per command: use quiet/plain-output flags and keep scope small (one target, rate limits, timeouts).
- Check `exitCode`, `stdout` and `stderr`; a "command not found" means the tool is not there — do not retry variants of it, and never install anything.
- The same call runs basic OS utilities (`dig`, `curl -sI`, `ping -c 3`, `whois`).

## 3. Connector tools: `run_tool_connector`

1. Run one with `run_tool_connector(tool, target)`; `tool` is the connector's `name` (its description lists the accepted slugs). Add `configProfileId` only when the user picked a profile.
2. Output is capped. When `truncated` is true, call `read_tool_output(runId, pattern)` to pull the lines you need instead of paging through everything.

Never run a connector's binary through `execute_remote_command`, and never pass a built-in tool to `run_tool_connector`.

## Approvals

A command or tool call may wait for the user's approval. If it is rejected, do not retry it.

## Safety

- Nothing destructive, no denial of service, no changes to the worker.
- Save results you will reuse with `stm_write`.
- A result outside the goal (an unexpected host, an unrelated service) goes in the report as a next step, not into new commands.
