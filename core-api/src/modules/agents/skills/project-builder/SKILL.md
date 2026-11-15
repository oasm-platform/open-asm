---
name: project-builder
description: Turn a scanning goal in plain words ("find the login pages of example.com", "weekly critical-CVE scan of our web apps", "watch new subdomains") into an OASM project with a configured tool pipeline — pick the tools from the data they take and find, set each connector's config fields from their meaning, wire the stages, schedule and verify it. Load before create_project or add_project_workflow with tools.
---

# Building a project and configuring its tools

A project is a scope (targets and rules) plus workflows that scan it. A workflow is a pipeline of tool steps. The user describes an outcome; your job is to turn it into the smallest pipeline that produces that outcome, with every connector configured for it. Never answer "the tools can't do that" before reading what each tool's config can do.

## 1. Pin down the request

Extract four things; ask only for what you cannot infer:

- **Outcome**: what the user wants to end up with — a list of URLs, open ports, live web services, vulnerabilities of some severity or type, screenshots.
- **Scope**: the targets (domain, IP, CIDR) and anything to exclude. Only what the user named or already owns in the workspace (`retrieve_targets`). Pass them as `targets`; existing ones are reused, new ones created. Do not also add a `target` scope rule for them.
- **Narrowing**: the words that restrict the outcome — "login", "admin", "API docs", "critical", "WordPress", "port 22", "only staging". Each one becomes a config value or a scope rule, not a reason to scan everything.
- **Cadence**: once (`runNow`), on a schedule (`schedule`, cron in UTC), or both.

## 2. Work backwards along the data chain

Every tool category takes some data kinds and produces others:

`target` → (subdomains) → `host` → (ports_scanner) → `service` → (http_probe) → `web` → (url_discovery) → `url`; vulnerabilities and screenshots consume `host`/`web`/`url`.

This chain is the shape, not the contract: tools of one category differ in what they take (one URL-discovery tool takes `web`, another takes `host`). A step's `category` and `input` must come from that tool's `inspect_pipeline_tool` output, never from this chain or the category name.

Start from the outcome's kind and walk back until you reach what the scope already has (a fresh target has only `target`; an existing project may already hold hosts and web services — check with `inspect_project`). Each hop is one stage. Skip hops whose data already exists, but keep them when the user wants new assets followed over time.

## 3. Choose the tools

1. `list_pipeline_tools` (search by category words) for candidates; note `type` and `isInstalled`.
2. `inspect_pipeline_tool` on **every** tool you will put in the pipeline, before building it: its `categories` (with `inputs`/`produces`), its `config` fields and its `profiles`.
3. Prefer, in order: a tool whose config can express the narrowing; an installed one whose required secret fields (if any) a profile already sets; a built-in for the generic early hops (subdomains, ports, HTTP probe).
4. One tool per need. Add a second tool of the same category only when it covers something the first cannot (a crawler finds linked pages, a fuzzer finds unlinked ones, an archive source finds old ones).
5. A tool with several categories needs `category` on its step. Set `input` only to narrow its own `inputs` (a subset, e.g. `web` of `[web, host]`); leave it out otherwise. A kind outside its `inputs` is refused.
6. A stage must feed the next: a step's inputs should include what an earlier stage produces. When none does (e.g. a tool that takes `host` after a stage producing `web`), it still runs on what the scope already holds; move it to the stage after the producer of its kind.

## 4. Configure each connector from its field descriptions

Read every `config` field of the chosen connectors and map the narrowing onto them:

- **Match/filter fields** (a regex, status codes, sizes, extensions): encode the narrowing — e.g. paths with login words, only 200/30x/401/403, only `.php`.
- **Selection fields** (wordlist, templates, tags, severity, plugins, ports, scan mode): pick the subset the goal needs, using the field's `enum` and `default` as the vocabulary.
- **Depth and scope fields** (depth, recursion, crawl scope, max URLs, max time): enough to reach the outcome, bounded.
- **Load fields** (threads, rate, delay, timeout): stay at or below the default unless the user asks otherwise.
- Leave every other field at its default: do not set what the goal does not need.

Rules that the tools enforce, so plan for them:

- A field that is not in `config` is refused; so is a value of the wrong type or outside its `enum`/limits.
- Fields marked `secret` (keys, tokens, passwords) are never set inline. They come from a config profile the user creates in the workspace. If the user pastes one in chat, do not use it: tell them to put it in a profile.
- A connector's required fields must be covered by the profile (`configProfileId`, or the default profile) plus the inline config. If no profile covers them, stop and tell the user which fields the profile needs (`missingRequired`).
- Built-in tools take no config at all.

## 5. Wire the stages

Give each step a `stage` (from 1): steps of one stage run in parallel; a stage starts when the previous one is done and sees what it found. Order follows the data chain from step 2. Independent tools that need the same input share a stage.

## 6. Confirm, then build

Before calling `create_project` (or `add_project_workflow` on an existing project), show the user a short plan: scope, then one line per step — stage, tool, why it is there, the config values you set and what each does — and the cadence. Then call it with `tools: [{ toolId, stage, category?, input?, config?, configProfileId? }]` (not `toolIds`, which takes no config).

A refusal starting with `Not executed:` names the step and the reason (category or input the tool does not take, unknown field, secret field, wrong value, missing profile). Fix that step — re-read its `inspect_pipeline_tool` output rather than guessing again — and call again; nothing was created or installed.

## 7. Verify and report

`inspect_project` to check the workflow and its triggers. Start it when the user asked to (`runNow`, or `run_project_workflow`), then follow the run with `list_project_runs` and read results with `list_project_assets` / `discover_vulnerabilities`. Report what the project does, when it runs, and which part of the request depends on a profile the user still has to add.

## Patterns

The same method covers any goal. Examples of the mapping, not recipes — always confirm the fields on the real tools:

| Goal | Chain to build | What the config narrows |
| --- | --- | --- |
| Login / admin / sensitive paths of a site | target → host → service → web → **url** | URL-discovery match regex on the path words, a wordlist for that path class, status codes kept |
| Critical CVEs on web apps, weekly | … → **web** → vulnerability | Scanner severity/tags to critical and high, `input: web`, a cron schedule |
| Exposed API docs | … → web → **url** | Match on doc paths (swagger, openapi, graphql), JSON extensions |
| Open management ports | target → host → **service** | Port list limited to the management ports |
| Follow new subdomains | **target → host**, then the rest on new assets | Default subdomain tool; a later workflow on `project.assets.added` |
| WordPress weaknesses | … → web → vulnerability | A WordPress scanner's enumerate/detection fields; its API token from a profile |

## Safety

Scan only the scope the user gave. Non-intrusive defaults: no brute force against authentication, no denial of service, rate limits at or below the defaults. Anything intrusive the user asks for goes in the plan you show for approval.
