---
name: browser
description: Drive a real headless browser on the conversation's worker with `execute_remote_command` and `browser ...` commands. Covers JavaScript-heavy pages, logins, forms, clicks, tabs, iframes, cookies, storage, console and network logs. Load before testing a web app interactively.
---

# Browser

The worker has a headless Chromium. Each command is one `execute_remote_command` call whose `command` starts with `browser `. The command does not go through a shell, so pipes, `;` and `&&` do not work. Send one browser command per call.

Use `retrieve_web_page` for a static page you only need to read. Use the browser when the page needs JavaScript, a login, clicks or form input.

The browser runs only on the workspace's own worker. On a shared, sandboxed worker the command fails with `browser commands are not available on a sandboxed worker`. When that happens, tell the user and do not retry.

## Sessions

1. `browser open https://app.example.com` starts a session. The first output line is `session: b-<id>`. The rest shows the page title, the URL and the interactive elements.
2. Pass that id to every later command: `browser -s b-<id> click @e3`.
3. A session ends after 10 minutes without commands, when the worker restarts, or when you run `browser -s b-<id> close`. Close it when you are done, because a worker allows only 8 sessions at once. If a command reports `browser session ... not found`, run `browser open` again.
4. Each session has its own cookies and storage. Sessions do not share logins.

## Scope

A session can reach only the host it opened, plus the hosts allowed with `--allow`. Requests to any other host, including redirects, iframes, scripts and `localhost`, are blocked. Blocked requests are listed under `blocked (out of scope ...)` in the command's output.

- Allow more hosts when opening: `browser --allow api.example.com --allow '*.cdn.example.com' open https://app.example.com`
- Allow more hosts later: `browser -s b-<id> allow api.example.com`

Only add hosts that are in the user's scope. The user approves every command, so they can see each `--allow`.

## Snapshot and refs

`snapshot` prints the accessibility tree of the page. Each element you can act on gets a ref such as `[ref=e5]`. Use refs as targets: `click @e5`.

- `snapshot -i` lists interactive elements only. This is the cheapest way to see what you can click.
- `snapshot` lists the full tree, including headings and text.
- `snapshot -s <css>` limits the tree to one region. `snapshot -d 2` limits the depth.

A ref is valid only for the page it came from. After a navigation, or when you see `ref @eN not found`, take a new snapshot. Actions such as `click` and `fill` print a single line. Run `snapshot -i` again to see what changed.

A target can also be a CSS selector (`#login`), `text=Sign in` or `xpath=//form//button`.

## Commands

All commands below take `-s <id>`. `<t>` is a target.

| Group | Commands |
|---|---|
| Navigate | `open <url>`, `back`, `forward`, `reload`, `url`, `title` |
| Look | `snapshot [-i] [-d n] [-s css]`, `get text [<t>]`, `get html [<t>]`, `get value <t>`, `get attr <t> <name>`, `get count <css>`, `get box <t>`, `is visible\|enabled\|checked <t>` |
| Act | `click <t> [--double] [--right]`, `dblclick <t>`, `hover <t>`, `focus <t>`, `fill <t> "text"` (replaces the value), `type <t> "text"` (appends with real keystrokes), `press Enter` / `press Control+a`, `select <t> <value or label>...`, `check <t>`, `uncheck <t>`, `scroll down [px]`, `scrollintoview <t>`, `drag <t> <t>`, `mouse move x y`, `mouse down`, `mouse up`, `mouse wheel dy` |
| Find | `find role button --name "Sign in" click`, `find label Email fill "a@b.c"`, `find placeholder Search`, `find text "Forgot password"`, `find alt\|title\|testid <value> [action]`. Without an action, `find` lists the matches with refs. |
| Wait | `wait <t>` (until visible), `wait 1000`, `wait --text "Welcome"`, `wait --url /dashboard`, `wait --load` or `wait --load idle`, `wait --fn "window.appReady === true"` |
| JavaScript | `eval "document.cookie"`, `eval "const r = await fetch('/api/me'); return r.status"` |
| Tabs and frames | `tab list`, `tab new [url]`, `tab 1`, `tab close [n]`, `frame <iframe t>`, `frame main`. Popups opened by the page show up in `tab list`. |
| Dialogs | Dialogs are handled automatically: alerts are accepted, while confirm and prompt dialogs are dismissed. `dialog accept ["prompt text"]` and `dialog dismiss` change this policy for later dialogs. Handled dialogs appear in `console`. |
| State | `cookies`, `cookies set <name> <value> [--domain d] [--path p]`, `cookies clear`, `storage local\|session [get k \| set k v \| clear]` |
| Network | `requests [--filter text] [--clear]`, `set headers '{"X-Api-Key":"..."}'`, `set credentials <user> <pass>` (HTTP Basic), `set offline on\|off` |
| Emulate | `set viewport 390 844`, `set useragent "..."`, `set media dark`, `set geo 10.77 106.69` |
| Debug | `console [--clear]`, `errors [--clear]` |

Quote any argument that contains spaces. A command fails after 30 seconds by default. Set another limit with `--timeout <ms>` before the subcommand, up to 55000.

## Example: log in and check a page

```
browser open https://app.example.com/login
browser -s b-1f... fill @e2 "analyst@example.com"
browser -s b-1f... fill @e3 "<password from the user>"
browser -s b-1f... click @e4
browser -s b-1f... wait --url /dashboard
browser -s b-1f... snapshot -i
browser -s b-1f... requests --filter /api/
browser -s b-1f... close
```

Never invent credentials. Use only credentials the user has provided for this test.
