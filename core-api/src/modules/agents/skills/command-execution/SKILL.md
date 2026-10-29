---
name: command-execution
description: How to run security tools on the conversation's worker — built-in tools with execute_remote_command, connector tools with run_tool_connector, shell utilities, output paging, and the scripted-spray pattern for trial-heavy classes. Load before running any tool or command.
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
| A scripted spray or a loop of requests | `execute_remote_command` with a script file, not one command per payload |
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
- The same call runs basic OS utilities (`dig`, `curl -sS -i`, `ping -c 3`, `whois`, `grep`, `jq`).
- Long-running work belongs in one bounded command, not a background process left running.

## 3. Connector tools: `run_tool_connector`

1. Run one with `run_tool_connector(tool, target)`; `tool` is the connector's `name` (its description lists the accepted slugs). Add `configProfileId` only when the user picked a profile.
2. Output is capped at the first 8KB. When `truncated` is true, call `read_tool_output(runId, pattern)` to pull the lines you need instead of paging through everything.

Never run a connector's binary through `execute_remote_command`, and never pass a built-in tool to `run_tool_connector`.

## 4. The scripted spray

Trial-heavy classes — SQLi, XSS, XXE, SSRF, RCE, auth/JWT, deserialization — are never tested payload-by-payload by hand. Write a script and run it once:

- Generate the corpus: the encoder set (URL, double-URL, unicode, base64, hex, HTML entity), the wrapper/comment set, the case variants, and the tool's own payload files where available.
- Iterate with bounded concurrency (a handful at a time), randomized order, rotated headers, and backoff on 429/5xx.
- Log one line per request: status, length, timing, and whether the marker reflected. Deduplicate by response similarity.
- Print the shortlist, then confirm the survivors individually with `curl -sS -i` so the evidence is a clean request/response pair.

Write the script to a file and run it (`python3 spray.py`, `bash spray.sh`); do not chain a hundred `curl` calls into one shell line. Keep the script and its output under the worker's working directory so a later command can read it.

## Reading output

The model gets the first 8KB of stdout. When `truncated` is true, the full output is kept for an hour under its `runId`: use `read_tool_output` with a `pattern` and, for JSON lines, `fields` to keep only the keys you need. Extract the facts and store them; never paste the dump into a plan step, an answer or a subagent brief.

## Approvals

A command or tool call may wait for the user's approval. If it is rejected, do not retry it — follow what the user said, or ask how to proceed.

## Safety

- Nothing destructive, no denial of service, no persistence, no changes to the worker.
- Rate-limit everything that talks to a target; an outage you caused is an incident, not a finding.
- Save results you will reuse with `stm_write`.
- A result outside the goal (an unexpected host, an unrelated service) goes in the report as a next step, not into new commands.
