# Workflows

A workflow is a list of jobs. Each job runs one tool, and `needs` orders the
jobs into a graph, the way GitHub Actions does. Jobs pass data along. A port
scanner finds services, an HTTP probe finds which of them are web services, a
web scanner scans those. This page explains the file format, the kinds of data
that move between jobs, and how a job picks what its tool receives.

## The file

```yaml
name: Recon and web scan
jobs:
  subdomains:
    run: subfinder
  ports:
    run: naabu
    needs: [subdomains]
  probe:
    run: httpx
    needs: [ports]
  web_vulns:
    run: nuclei
    needs: [probe]
    input: web              # optional, see "Choosing the input"
```

| Field | Required | Meaning |
| --- | --- | --- |
| `run` | yes | The tool, by name (`nuclei`) or connector slug. |
| `needs` | no | Jobs that must finish first. A job without `needs` starts right away. |
| `category` | no | The mode to run a multi-mode tool in (`nmap` scans ports or vulnerabilities). Defaults to the tool's first. Required when one tool runs in two jobs. |
| `input` | no | The kinds of data the job takes, best first. Defaults to the tool's own `inputs`. |
| `allowFailure` | no | `false` fails the job when any of its fan-out jobs fails. By default a job is done when it produced results. |
| `config`, `configProfileId` | no | Tool configuration, inline or from a saved profile. |

The `jobs` map key is the job's id; `needs` refers to it. A job finding nothing to
scan is skipped and does not block the jobs after it.

## When it runs: `on:`

A workflow of a project says when it runs on its own, in its file:

```yaml
name: Weekly web scan
on:
  schedule:
    - cron: '0 2 * * 1'        # UTC, like GitHub Actions
    - cron: '30 14 * * *'
  project.assets.added:         # when assets join the project
    windowMinutes: 10           # gather them, then start one run
    maxAssets: 200              # more start further runs right away
    targetTypes: [DOMAIN]       # only these; empty = every asset
  project.run.completed:        # after another workflow of the project
    workflows: [Recon]          # empty = any other workflow
    status: [success]           # success, failure
  vulnerability.detected:       # on the asset a scan found something on
    severity: [critical, high]
jobs:
  ...
```

- Every run, whatever started it, scans the assets of the workflow's project.
  A schedule scans all of them. An event scans what it is about:

  | Event | Scans | Its own settings |
  | --- | --- | --- |
  | `project.assets.added` | The assets that joined: picked by hand, added by a rule edit, or discovered and selected by the rules. | none |
  | `project.run.completed` | What the finished run scanned. Only runs of the project's other workflows count. | `workflows` (names), `status` (default `[success]`) |
  | `vulnerability.detected` | The asset of the new findings, whichever workflow (or project) found them, if it is in the project. | `severity` (default `[critical, high]`) |

- Every event takes `windowMinutes` (default 10), `maxAssets` (200) and
  `targetTypes` (empty). The assets of the events within the window go into
  one run. One batch is open at a time, so the window is also the least time
  between two runs of the trigger. `0` starts a run right away.
- An event key is the event bridge name the projects lane listens to. A
  workflow has at most one trigger per event. `true` takes the defaults.
- A run started by an event records the run that caused it
  (`job_histories.causedByRunId`) and how many event hops that makes
  (`chainDepth`). An event that would make a fourth hop starts nothing, and a
  workflow never runs on its own completion or findings, so workflows that
  trigger each other stop. Its own discoveries still start it, which is how a
  recon workflow follows the subdomains it found.
- Each workflow has its own schedules. A project with several workflows runs
  each on its own clock.
- Turning a trigger off (its "Active" switch in the workflow editor) does not
  change the file, like disabling a workflow on GitHub. Archiving the project
  turns every trigger off until it is reopened.
- Adding or editing a workflow sets this block, and so does creating a
  project (`on` in the API, which replaces the whole block). The Schedule tab
  only shows it, with the runs of the next 7 days. Saving the pipeline alone
  keeps it.
- `on.target` (`domain.create`, …) is for the workspace's default workflows,
  which run when a target is added; a project workflow never uses it.

Each entry has a row in `project_workflow_triggers` with what the file does
not hold: whether it is on, when it last fired and its BullMQ scheduler. A
schedule is a BullMQ job scheduler `project-trigger:<triggerId>` on the
`asset-groups-workflow-schedule` queue (named before projects existed; the
name stays so no scheduler is orphaned). At startup the API brings BullMQ in
line with the database: missing schedulers are registered again, and ones no
trigger uses are removed.

## Data kinds

Everything a tool takes or finds is one of these kinds.

| Kind | What it is | A connector receives |
| --- | --- | --- |
| `target` | The asset a target was created with: the domain or IP the user added. | `target=example.com` |
| `host` | A hostname or IP address. Any asset of a domain, IP or CIDR target. | `target=app.example.com` |
| `service` | An open port of a host, whatever it speaks. | `target=app.example.com:22` |
| `web` | A service that answered HTTP(S), as its base URL. The default port of the scheme is left out. | `target=https://app.example.com:8443` |
| `url` | A URL with a path, found by URL discovery. At most 50 per host, newest first. | `target=https://app.example.com/login` |
| `repository` | A repository of a Git organization target. | `repository`, `ref`, and `username`/`token` for private ones |
| `vulnerability` | A finding. Tools produce it; none takes it as input. | — |

Apart from repositories, a connector always gets a single `target`, as it did
before kinds existed. What changes is how precise it is. A connector that
declares `web` must accept a URL there, port included.

## What a tool declares

Each mode of a tool says what it takes and what it finds. For a connector this
is in its `manifest.yaml` in
[oasm-connectors](https://github.com/oasm-platform/oasm-connectors):

```yaml
capabilities:
  - name: vulnerabilities
    targetTypes: [domain, ip, cidr]
    inputs: [web, host]          # best first
    produces: [vulnerability]
```

The built-in tools declare the same in
`core-api/src/modules/tools/tools-provider/built-in-tools.ts`:

| Tool | Takes | Finds |
| --- | --- | --- |
| subfinder | `target` | `host` |
| naabu | `host` | `service` |
| httpx | `service` | `web` |
| screenshot | `web` | — |

A manifest written before `inputs` and `produces` existed still works: each
category falls back to what it was always given.

| Category | Default `inputs` | Default `produces` |
| --- | --- | --- |
| `subdomains` | `target` | `host` |
| `ports_scanner` | `host` | `service` |
| `http_probe` | `service` | `web` |
| `screenshot` | `web` | — |
| `url_discovery` | `web` | `url` |
| `vulnerabilities` | `host` (`repository` for Git organizations) | `vulnerability` |

## How a job picks what its tool receives

A run has a scope: the assets of the target, or the assets of a project. For
every asset in that scope, the job takes the first of its input kinds that has
something for the asset, and creates one tool run per item of that kind.

With `inputs: [web, host]`:

- `app.example.com` has web services on 443 and 8443 → two runs, on
  `https://app.example.com` and `https://app.example.com:8443`.
- `api.example.com` was never probed → one run, on `api.example.com`.

So a tool gets the most precise data known, and still runs on hosts nothing has
probed yet. Data found earlier in the same run counts. In the file above,
`httpx` sees the ports `naabu` just found, because a job looks up its inputs
when it starts, not when the run starts.

URLs are stored per service. A URL discovery tool that runs on a whole host
(`gau`, `katana`) gets each URL filed under the service of its port, or under
the host's main web service (443, then 80) when no port matches.

## Choosing the input

`input` lets a job narrow or reorder what its tool accepts. It may only use
kinds the tool lists in its `inputs`; anything else is rejected when the
workflow is saved.

```yaml
web_vulns:
  run: nuclei              # nuclei takes [host, web]
  input: web               # only web services: every port, scheme kept
```

The Fast scan (`POST /vulnerabilities/scan`) runs the nuclei step of
`vulnerability_scan_basic.yaml` with its `input: [web, host]`: every web
service httpx confirmed live, and the host itself when discovery found none.

## For contributors

| File | What it does |
| --- | --- |
| `core-api/src/common/enums/enum.ts` | `DataKind`, the list of kinds. |
| `core-api/src/modules/tools/tool-io.ts` | Category defaults, and the rule that a job's `input` must be among its tool's `inputs`. |
| `core-api/src/modules/tools/tool-categories.ts` | Reads `inputs` and `produces` from a connector manifest. |
| `core-api/src/modules/workflows/workflow-graph.ts` | Parses and validates the `jobs` map, including `input`. |
| `core-api/src/modules/jobs-registry/step-inputs.ts` | Decides which runs a job creates and what each receives. Pure, see its spec. |
| `core-api/src/modules/jobs-registry/step-scope.loader.ts` | Loads the assets, services and URLs of a run's scope. |
| `core-api/src/modules/data-adapter/url-owner.ts` | Picks the service a URL found by a host-wide job is stored under. |
| `core-api/src/modules/projects/workflow-on.ts` | Reads and writes the `on:` block of a project workflow, and plans how its trigger rows follow it. Pure. |
| `core-api/src/modules/projects/project-triggers.service.ts` | Edits `on:`, keeps the rows and BullMQ schedulers in line, gathers the events of triggers into batches and fires them. |
| `core-api/src/modules/event-bridge/sinks/projects/projects.sink.ts` | The projects lane: discovery batches, and the events triggers run on. |
| `core-api/src/modules/projects/project-run-events.listener.ts` | Publishes `project.run.completed` when a project run finishes. |

To add a kind: add it to `DataKind` and to `INPUT_KINDS` or `PRODUCED_KINDS`.
Then teach `planStepInputs` what one item of it is, and load its rows in
`StepScopeLoader`. Finally, list it in the `oasm-connectors` manifest
validator and in this page.
