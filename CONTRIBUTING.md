# Contributing to OASM

Thanks for considering a contribution. This guide reflects how this repo actually works — read the [Hard Rules](#hard-rules) first, they are the mistakes every newcomer makes here.

## Ways to Contribute

- **Bug fixes** — especially tenant-isolation, auth, and scanner-pipeline bugs.
- **New connectors** — live in the separate [oasm-connectors](https://github.com/oasm-platform/oasm-connectors) repo, not here. This repo only syncs its `manifest.json`.
- **Docs and tests** — always welcome, lowest review friction.
- **Security workflow improvements** — asset discovery, finding triage, scheduling, alerting.

## Prerequisites

| Tool | Version |
|------|---------|
| [Task](https://taskfile.dev/#/installation) | any recent |
| Node.js | 22 |
| pnpm | 10.33.2 (via `task init` / corepack) |
| Go | 1.26 |
| Docker + Compose | for infra and full stack |

## Setup

```bash
git clone https://github.com/oasm-platform/open-asm.git
cd open-asm
task init        # deps + example.env copies + postgres/redis/geo-ip/rustfs
# worker/.env is NOT created by task init — copy it manually:
cp worker/.example.env worker/.env   # then set WORKER_API_KEY
task dev         # API :6276 + Console :5173
task worker:dev  # local worker (needs Docker daemon)
```

Full walkthrough: [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md). Repo conventions for agents: [`AGENTS.md`](AGENTS.md).

## Hard Rules

1. **All commands via `task` from the repo root.** Never `npm run`, `pnpm run`, raw `go test`/`go build`/`go vet`. The taskfiles carry RAM limits and transform config raw scripts bypass. Missing entry → add it to the taskfile.
2. **Never hand-write a migration.** Schema changes need explicit maintainer approval first, then `task migration:generate name=AddFooColumn`. Never touch `core-api/src/database/migrations/` by hand, never run the TypeORM CLI or `psql` DDL directly. Only run `migration:run`/`revert` against a local DB.
3. **Never hand-edit generated code**: `console/src/services/apis/gen/`, `console/src/routeTree.gen.ts`, `worker/internal/gen/`, `.open-api/*`, `core-api/resources/connectors/manifest.json`. Change the source, re-run the generator.
4. **Never commit `.env`.** It is gitignored; copy from `*/example.env`.
5. **`task lint` is sequential** (`api:lint` then `console:lint`) — never parallelize the two linters.
6. **Scope sign-off needed** for schema changes, new public API contracts, dependency bumps, CI/workflow edits. Don't bundle them "while you're in there".

## Workflow

1. Fork, branch: `git checkout -b feat/short-name` (or `fix/…`).
2. Make the change. Keep diffs minimal; one concern per PR — see [Pull Request Size](#pull-request-size).
3. Verify (pre-commit hook is **inert** — nothing runs automatically):
   ```bash
   task lint
   task api:test                                        # Jest, API unit tests
   task console:test:run                                # Vitest single pass (CI parity)
   task worker:test                                     # + task worker:test-race for concurrency changes
   ```
4. If you touched contracts, regenerate **before** pushing:
   - API contract → `task gen-api` (needs booted API), commit `.open-api/*.json` **and** `console/src/services/apis/gen/queries.ts`.
   - Proto files → `task proto`, output in `worker/internal/gen/`.
   - Connector catalog → `task sync-connectors` (or `MANIFEST_PATH=<local>/manifest.json` for preview).
5. Push, open a PR against `main` with a clear description, linked issue, and test evidence.

## Pull Request Size

Small PRs get reviewed faster and more carefully. Past a few hundred lines, reviewers start skimming and bugs get through. This matters even more with AI-assisted code: a generated diff is cheap to produce, but reviewing it is no faster.

**Limits** (enforced by the `pr-size` workflow):

| Lines changed | Result |
|---|---|
| ≤ 400 | ✅ Ideal |
| 401 – 1,000 | ⚠️ Bot posts a warning comment; check passes |
| > 1,000, or > 40 files | 🚫 Check fails |

Lockfiles, generated code (`.open-api/`, `console/src/services/apis/gen/`, `routeTree.gen.ts`, `worker/internal/gen/`, connector `manifest.json`), migrations, snapshots and deleted files are not counted.

**One PR = one logical change.** If you can't describe the PR in one sentence without "and", split it. Ways to split:

- **Prep refactor first.** Land the rename, extraction or move as its own PR with no behaviour change, then make the real change on top of it.
- **Stack PRs.** Open PR 2 with PR 1's branch as its base and mention the dependency in the description. Once PR 1 merges, rebase PR 2 onto `main`.
- **Split by layer.** Backend endpoint + tests → regenerated client → console UI. Each one ships separately.
- **Hide unfinished work behind a flag or an unrouted page**, so partial features can merge without being user-visible.
- **Keep schema, contract and dependency changes separate** (they need sign-off anyway, see Hard Rule 6).
- **No drive-by changes.** Formatting sweeps, unrelated cleanups and "while I'm here" fixes go in their own PR.

**Using AI tools:** you own every line you submit. Review the full diff yourself before opening the PR. If the agent produced more than one concern, ask it to plan a split into a sequence of PRs instead of submitting the whole thing.

**Exceptions:** some changes are large but mechanical, such as a repo-wide rename or a vendored update. A maintainer can apply the `size/override` label to these. Ask in the PR and explain why it can't be split. Contributors should not apply the label themselves.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced by the `commit-msg` hook:

```
feat|fix|hot-fix|perf|chore|docs|style|refactor|test|ci(scope): description
```

## Testing Conventions

- **core-api**: Jest, `*.spec.ts` colocated with source, external deps mocked. Single file: `task api:test:one SPEC=<path>`. E2E (`task api:test:e2e`) needs live Postgres + Redis.
- **console**: Vitest (`task console:test` is watch mode — CI runs `task console:test:run`); Playwright specs in `console/e2e/`.
- **worker**: `go test ./...` via `task worker:test`; race detector for anything concurrent.

## Code Style Pointers

- **core-api**: Controller → Service → Repository. DTOs with `class-validator` + Swagger decorators (orval depends on them). `no-console`, no floating promises, `consistent-type-imports` fail the build. User responses expose only `id`, `name`, `image`. Workspace scoping is mandatory (`@WorkspaceId()`, never trust client-supplied tenant ids).
- **console**: feature components under `components/<feature>/`, page-local under `pages/<page>/components/`; file-based routes in `src/routes/`; orval hooks (`use<OperationId>`); skeletons/empty states on data cards.
- **worker**: `go fmt` clean (CI fails otherwise), `go vet` via `task worker:lint`.

## Issues and PRs

- Use the templates: [bug report](.github/ISSUE_TEMPLATE/bug-report.yml) / [feature request](.github/ISSUE_TEMPLATE/feature-request.yml). Search existing issues first.
- Good first areas: docs gaps, console empty states, connector manifest freshness, test coverage for untested modules (check — some modules have no suite).
- There is no separate Code of Conduct file; be respectful, stay on-topic, no harassment or spam. Maintainers may close disruptive threads.

## CI

Path-filtered workflows in `.github/workflows/`: `check-lint`, `check-test` (API), `check-build`, `frontend-tests` (console, `main` only), `worker-ci` (fmt + vet + build), `check-e2e`, `pr-size` (every PR, not path-filtered — see [Pull Request Size](#pull-request-size)), `build-release`/`build-nightly`. Rehearse locally: `bash .github/scripts/test-local.sh <workflow>` (needs Docker + `act`). Local equivalents: `task lint`, `task api:test`, `task build`, `task console:test:run`, `task worker:format && task worker:lint && task worker:check`.
