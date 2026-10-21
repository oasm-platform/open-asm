# Agent Browser

Agents drive a headless Chromium on a worker by calling `execute_remote_command` with a command that starts with `browser `. The agent-facing guide is the builtin skill `core-api/src/modules/agents/skills/browser/SKILL.md`.

## How it runs

- The remote execute handler (`worker/internal/worker/remote_execute.go`) checks for the `browser ` prefix first, before any shell wrapping or sandbox session. Lines with that prefix are parsed and run in Go against go-rod, so they never reach `sh -c` or a sandbox container. This is the same pattern as the `screenshot <url>` job.
- The output comes back on the usual stdout/exit channel: exit 0 on success and exit 1 when the action fails. A worker-side failure, such as Chromium failing to start, is reported as an ERROR result. Results are sent under the command's own id, so a slow browser command cannot be attributed to a later one. Core is unchanged: approvals still apply to the raw command, and long output still pages through `read_tool_output`.
- The agent browser is a separate Chromium process from the one screenshot jobs use. It is launched lazily on the first `browser` command and relaunched if it dies or stops answering a 5-second health check.

## Where it is allowed

Browser commands run on every worker, including a sandboxed one (`WORKER_AGENT_SANDBOX=true`) that core lets serve every workspace. The browser runs inside the worker process, not in the per-session container. There is no host scope: a session may load any site and follow redirects, iframes and popups anywhere. On a sandboxed worker the worker's own network is the platform's, so sessions there reach only public addresses (see Network access).

The agent Chromium is hardened because it loads pages from arbitrary sites (`browser_launch.go`, `browser_sessions.go`):

- It starts with only the environment it needs (`PATH`, `HOME`, locale, temp dirs), not the worker's (API key, tokens).
- On a sandboxed worker, WebRTC may not send UDP outside the proxy (`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`).
- Downloads are denied in every session context.

This narrows, but does not remove, the risk of running it next to the worker. A Chromium exploit in a renderer still runs as the worker user, which on a sandboxed worker can reach `docker.sock` and the join token.

## Sessions

- Core creates a new remote-exec session for every command. Browser state is therefore keyed by its own id, `b-<32 hex>`, which `browser open <url>` returns. Every later command passes this id with `-s`.
- The id is the only credential for a session. `browser sessions` reports only how many sessions are open, never their ids, so that on a shared worker one conversation cannot find another's session.
- Each session is a separate incognito browser context, so cookies and storage are not shared between sessions.
- Limits (in `browser_sessions.go` and `browser_cmd.go`):
  - a session is idle-closed after 10 minutes;
  - at most 8 live sessions per worker;
  - each command times out after 30 seconds by default, and `--timeout` allows up to 55 seconds (core stops waiting at 60 seconds);
  - a command still running 3 seconds after its timeout closes its session. rod's mouse and keyboard calls ignore the command's context, so a page that stops answering (an endless script, a stuck dialog) would otherwise hold the session and a remote-exec slot forever. Each session's pages run on a session context, and cancelling it aborts every CDP call pending in the session;
  - each session keeps the last 200 lines of its console, error and request logs.
- Sessions live in memory only and are lost when the worker restarts.

## Network access

On a workspace's own worker, sessions use no proxy and reach whatever the worker can reach, including its localhost and private network.

On a sandboxed worker, each session's browser context sends all of its traffic through a small forward proxy dedicated to that session (`browser_proxy.go`, set via `Target.createBrowserContext` `proxyServer`, with `<-loopback>` so localhost is proxied too). The proxy forwards any host but checks the address each connection actually dials, after DNS. Only public addresses pass. Loopback, private, link-local (including cloud metadata), carrier-grade NAT and other special-purpose ranges are refused, so a public name that resolves to a local address is refused too. Because the check happens in the proxy rather than per page, it also covers redirects, iframes, popups, workers and WebSockets. `open` refuses `localhost` and non-public IPs up front, and refused requests from pages are listed in the command output.

At each launch on a sandboxed worker, the worker checks that the browser really routes a context through its proxy, by loading an unresolvable `.invalid` URL that only the proxy can answer. A browser that ignores the proxy is refused (go-rod's Chromium 128 on Windows does), because its sessions could reach local addresses. On such a host the shared-worker integration test skips.

## Not supported

- Returning screenshots, PDFs or downloads to the agent. Output is text only.
- File upload.
- Traces or HAR capture.
- Keeping sessions across a worker restart.
