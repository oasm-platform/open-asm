# Agent Browser

Agents drive a headless Chromium on a worker by calling `execute_remote_command` with a command that starts with `browser `. The agent-facing guide is the builtin skill `core-api/src/modules/agents/skills/browser/SKILL.md`.

## How it runs

- `executeRemoteCommand` (`worker/internal/worker/remote_execute.go`) checks for the `browser ` prefix first, before any shell wrapping. Lines with that prefix are parsed and run in Go against go-rod, so they never reach `sh -c`. This is the same pattern as the `screenshot <url>` job.
- The output comes back on the usual stdout/exit channel: exit 0 on success and exit 1 when the action fails. A worker-side failure, such as Chromium failing to start, is reported as an ERROR result. Core is unchanged: approvals still apply to the raw command, and long output still pages through `read_tool_output`.
- The agent browser is a separate Chromium process from the one screenshot jobs use. It is launched lazily on the first `browser` command and relaunched if it dies.

## Where it is allowed

Browser commands are refused on any worker started with `WORKER_AGENT_SANDBOX=true`. The browser runs inside the worker process, outside the per-session container, so it would bypass the sandbox. Core routes agent commands to a global worker only when that worker is sandboxed. As a result, agents can use the browser only on a workspace's own worker that runs without the sandbox.

## Sessions

- Core creates a new remote-exec session for every command. Browser state is therefore keyed by its own id, `b-<32 hex>`, which `browser open <url>` returns. Every later command passes this id with `-s`.
- Each session is a separate incognito browser context, so cookies and storage are not shared between sessions.
- Limits (in `browser_sessions.go`):
  - a session is idle-closed after 10 minutes;
  - at most 8 live sessions per worker;
  - each command times out after 30 seconds by default, and `--timeout` allows up to 55 seconds (core stops waiting at 60 seconds);
  - each session keeps the last 200 lines of its console, error and request logs.
- Sessions live in memory only and are lost when the worker restarts.

## Scope enforcement

Each session's browser context sends all of its traffic through a small forward proxy dedicated to that session (`browser_proxy.go`, set via `Target.createBrowserContext` `proxyServer`, with `<-loopback>` so localhost is proxied too). The proxy refuses any host outside the session's allowlist. The allowlist starts as the host of the `open` URL plus any `--allow` values, and the `allow` command can extend it. Because the check happens in the proxy rather than per page, it also covers redirects, iframes, popups, workers and WebSockets. Hosts are matched by name, either exactly or as `*.suffix`, and the port is ignored.

## Not supported

- Returning screenshots, PDFs or downloads to the agent. Output is text only.
- File upload.
- Traces or HAR capture.
- Keeping sessions across a worker restart.
