#!/usr/bin/env node
//
// Tag a release and hand it to CI.
//
//   node scripts/release.mjs v0.9.0
//   node scripts/release.mjs 0.9.0            # the `v` prefix is added for you
//   node scripts/release.mjs v0.9.0 --dry-run
//   node scripts/release.mjs v0.9.0 --skip-checks
//
// Everything CI needs is derived from the tag: build-release.yml triggers on
// `push: tags: ['v*']`, and the changelog action resolves its own from-tag from
// the semver sequence. So publishing a release here is exactly "create the tag
// and push it" — the binaries, the images and the draft release are all built by
// the workflow. The draft stays a draft: publishing it is a deliberate human
// click in the UI, because `release: types: [published]` is not wired up.
//
// The pre-flight exists because nothing else guards the tag: pre-commit is
// inert in this repo, and a tag is the one thing that cannot be undone
// gracefully once CI has pushed :latest.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// --- terminal ---------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s))
const bold = paint('1')
const dim = paint('2')
const red = paint('31')
const green = paint('32')
const yellow = paint('33')
const cyan = paint('36')

// --- git --------------------------------------------------------------------

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (err) {
    if (allowFail) return null
    fail(`git ${args.join(' ')} failed:\n${(err.stderr || err.message).toString().trim()}`)
  }
}

function currentTags() {
  return (git(['tag', '--list'], { allowFail: true }) || '').split('\n').filter(Boolean)
}

// --- output -----------------------------------------------------------------

const problems = []
const notes = []

function fail(message) {
  console.error(`\n${red('✗ ' + message)}\n`)
  process.exit(1)
}

function heading(text) {
  console.log(`\n${bold(text)}`)
}

function ok(text) {
  console.log(`  ${green('✓')} ${text}`)
}

function warn(text) {
  notes.push(text)
  console.log(`  ${yellow('!')} ${text}`)
}

function detail(text) {
  console.log(`    ${dim(text)}`)
}

function usage() {
  console.log(`
${bold('Usage')}  task release -- v0.9.0 [options]
       task release VERSION=v0.9.0 [options]

  The \`--\` is required by go-task: it treats a bare \`task release v0.9.0\` as a
  request for a task literally named \`v0.9.0\`. Both the \`--\` form and the
  \`VERSION=\` form work; the latter is the one to use for a message with spaces.

  v0.9.0               Release version. \`v\` is added when missing: 0.9.0 -> v0.9.0
  --dry-run            Run every check, print the commands, push nothing
  --skip-checks        Do not run \`task lint\` / \`task test\` first
  --branch NAME        Branch the release must be cut from (default: remote HEAD)
  --all                Include bot bumps and the ci/style types
  --notes-only         Just render the notes for a range, then exit. No
                       pre-flight, no checks, no tag, no push. This is what CI
                       uses to fill in the release body.
  --from REF           Start of the range (default: newest tag older than --to)
  --to REF             End of the range (default: HEAD)
  --notes-file PATH    Also write the notes to PATH

  Equivalent task variables, for values that contain spaces:
  DRY_RUN=1  SKIP_CHECKS=1  BRANCH=main  MESSAGE="Release v0.9.0"  ALL=1
`)
}

// --- semver -----------------------------------------------------------------

// Enough of semver to order this repo's own tags: major.minor.patch, an
// optional -prerelease, and optional +build metadata (ignored, as semver says).
function parseVersion(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(tag)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null }
}

function comparePrerelease(a, b) {
  if (a === b) return 0
  if (a === null) return 1 // a release outranks any prerelease
  if (b === null) return -1
  const as = a.split('.')
  const bs = b.split('.')
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i]
    const y = bs[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (+x !== +y) return +x < +y ? -1 : 1
      continue
    }
    if (xn !== yn) return xn ? -1 : 1 // numeric identifiers rank below alphanumeric
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePrerelease(a.pre, b.pre)
}

// --- release notes ----------------------------------------------------------

// Section order, titles and grouping follow gin-gonic/gin's release notes, which
// is the clearest conventional-commits rendering in the wild: a fixed set of
// headings, the commit subject left exactly as written, and anything
// unrecognised collected under "Others".
const CATEGORIES = [
  { types: ['feat'], title: 'Features' },
  { types: ['fix', 'hot-fix'], title: 'Bug fixes' },
  { types: ['chore'], title: 'Enhancements' },
  { types: ['refactor'], title: 'Refactor' },
  { types: ['ci'], title: 'Build process updates' },
  { types: ['docs'], title: 'Documentation updates' },
  { types: ['perf', 'test'], title: 'Others' },
]

// Hidden by default. Bot bumps are dependency churn rather than a change
// anyone reads a release for, and these two types are noise in a changelog.
// `task release --all` opts back in.
const BOT_AUTHOR = /^(dependabot|github-actions|renovate)(\[bot\])?$/
const HIDDEN_TYPES = new Set(['ci', 'style'])

const SUBJECT = /^([a-zA-Z][a-zA-Z-]*)?(\([^)]*\))?(!)?:\s*([\s\S]+)$/

// GitHub autolinks a bare 40-char sha to /commit/<sha> (displaying 7 chars) and
// a bare @login to the profile, which is why gin's stored body needs no explicit
// links. That only works for the login, not the display name, so the login is
// recovered from the noreply address when there is one.
function authorLogin(name, email) {
  const noreply = /^[0-9]+\+([A-Za-z0-9._-]+)@users\.noreply\.github\.com$/.exec(email || '')
  if (noreply) return noreply[1]
  if (name && /^[A-Za-z0-9._-]+(\[bot\])?$/.test(name)) return name
  return null
}

function commitType(subject) {
  const m = SUBJECT.exec(subject)
  return m && m[1] ? m[1].toLowerCase() : null
}

function formatLine({ sha, name, email, subject }) {
  const login = authorLogin(name, email)
  // The PR reference is already in the subject: GitHub's squash merge appends
  // "(#1234)", so it only needs to survive into the body to become a link.
  return `* ${sha}: ${subject}${login ? ` (@${login})` : ''}`
}

function renderNotes(from, to, { includeBots = false } = {}) {
  const range = from ? `${from}..${to}` : to
  const raw = git(['log', '--no-merges', '--reverse', '--format=%H%x1f%an%x1f%ae%x1f%s%x1e', range], { allowFail: true })

  const commits = (raw || '')
    .split('\x1e')
    .map((c) => c.replace(/^[\s\x1f]+/, '').replace(/[\s\x1f]+$/, ''))
    .filter(Boolean)
    .map((chunk) => {
      const [sha, name, email, subject = ''] = chunk.split('\x1f')
      return { sha, name, email, subject: subject.trim() }
    })

  const buckets = CATEGORIES.map((c) => ({ title: c.title, types: c.types, items: [] }))
  const others = buckets[buckets.length - 1] // "Others" is the catch-all
  const hidden = { bots: 0, types: 0 }

  for (const commit of commits) {
    const type = commitType(commit.subject)
    const login = authorLogin(commit.name, commit.email)
    if (!includeBots && (BOT_AUTHOR.test(commit.name) || BOT_AUTHOR.test(login || ''))) {
      hidden.bots++
      continue
    }
    if (!includeBots && type && HIDDEN_TYPES.has(type)) {
      hidden.types++
      continue
    }
    const bucket = (type && buckets.find((b) => b.types.includes(type))) || others
    bucket.items.push(formatLine(commit))
  }

  const sections = buckets.filter((b) => b.items.length > 0)
  if (sections.length === 0) {
    return { text: '## Changelog\n\n_No user-facing changes in this release._\n', shown: 0, hidden }
  }

  const lines = ['## Changelog']
  for (const section of sections) {
    lines.push('', `### ${section.title}`, '', ...section.items)
  }
  return { text: lines.join('\n') + '\n', shown: commits.length - hidden.bots - hidden.types, hidden }
}

// The highest semver tag strictly older than `to`. In CI the tag that triggered
// the run is already present in the checkout, so "the newest tag" would be the
// release itself and the range would be empty.
function resolveFrom(to) {
  const ceiling = parseVersion(to)
  const candidates = (git(['tag', '--list'], { allowFail: true }) || '').split('\n').filter((t) => {
    const v = parseVersion(t)
    return v && (!ceiling || compareVersions(v, ceiling) < 0)
  })
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => compareVersions(parseVersion(b), parseVersion(a)))[0]
}

function revParse(ref) {
  return git(['rev-parse', '--verify', '--quiet', ref + '^{commit}'], { allowFail: true })
}

// A ref that does not resolve makes `git log` fail, and that failure is swallowed
// further down — which surfaces as an empty release rather than an error. A
// version that is not tagged yet is a legitimate preview request, so it falls
// back to HEAD; anything else is a typo and has to stop the run.
function resolveTo(ref) {
  if (!ref) return 'HEAD'
  if (revParse(ref)) return ref
  if (parseVersion(ref)) {
    console.error(dim("'" + ref + "' is not a tag yet — previewing against HEAD instead"))
    return 'HEAD'
  }
  fail("--to '" + ref + "' does not resolve to a commit")
}

// --- arguments --------------------------------------------------------------

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  usage()
  process.exit(0)
}

const flags = new Set(argv.filter((a) => a.startsWith('--')))
let message = null
let branchOverride = null
let fromRef = null
let toRef = null
let notesFile = null
const positional = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--message') message = argv[++i]
  else if (arg === '--branch') branchOverride = argv[++i]
  else if (arg === '--from') fromRef = argv[++i]
  else if (arg === '--to') toRef = argv[++i]
  else if (arg === '--notes-file') notesFile = argv[++i]
  else if (!arg.startsWith('--')) positional.push(arg)
}

// go-task variables are single strings, so they are read as a word list and
// merged with the argv that `task release -- ...` forwards. The env form wins:
// it is the only one that survives a value with spaces.
const env = (name) => (process.env[name] || '').trim()
const envWords = (name) => env(name).split(/\s+/).filter(Boolean)
const truthy = (name) => env(name) && /^(1|true|yes|on)$/i.test(env(name))

if (message === null && env('RELEASE_MESSAGE')) message = env('RELEASE_MESSAGE')
if (branchOverride === null && env('RELEASE_BRANCH')) branchOverride = env('RELEASE_BRANCH')
if (fromRef === null && env('RELEASE_FROM')) fromRef = env('RELEASE_FROM')
if (toRef === null && env('RELEASE_TO')) toRef = env('RELEASE_TO')
if (notesFile === null && env('RELEASE_NOTES_FILE')) notesFile = env('RELEASE_NOTES_FILE')
if (truthy('RELEASE_DRY_RUN')) flags.add('--dry-run')
if (truthy('RELEASE_SKIP_CHECKS')) flags.add('--skip-checks')
if (truthy('RELEASE_ALL')) flags.add('--all')
for (const word of envWords('RELEASE_ARGS')) {
  if (word.startsWith('--')) flags.add(word)
  else positional.push(word)
}

const dryRun = flags.has('--dry-run')
const skipChecks = flags.has('--skip-checks')
const notesOnly = flags.has('--notes-only')
const includeBots = flags.has('--all')

// --- notes-only -------------------------------------------------------------
// The path CI takes: no pre-flight, nothing is written to git, just the markdown
// that becomes the release body. Skipped entirely when a version was supplied,
// so `task release -- v0.9.0 --notes-only` is not silently a no-op.
if (notesOnly && positional.length === 0) {
  const to = resolveTo(toRef)
  const from = fromRef || resolveFrom(to)
  if (from && !revParse(from)) fail("--from '" + from + "' does not resolve to a commit")
  const { text, shown, hidden } = renderNotes(from, to, { includeBots })
  if (hidden.bots || hidden.types) {
    console.error(dim(`hidden ${hidden.bots} bot commit(s), ${hidden.types} ci/style commit(s) — pass --all to include`))
  }
  process.stdout.write(text)
  if (notesFile) {
    writeFileSync(resolve(ROOT, notesFile), text)
    console.error(dim(`wrote ${notesFile} (${shown} entries)`))
  }
  process.exit(0)
}

if (positional.length === 0) {
  usage()
  fail('VERSION is required: task release -- v0.9.0')
}
if (positional.length > 1) fail(`expected one VERSION, got: ${positional.join(', ')}`)

const requested = positional[0]
const tag = requested.startsWith('v') ? requested : 'v' + requested
if (tag !== requested) {
  console.log(`${dim(`normalising ${requested} -> ${tag}`)}`)
}

const target = parseVersion(tag)
if (!target) {
  fail(`'${tag}' is not a version. Expected MAJOR.MINOR.PATCH, optionally with a prerelease suffix: task release -- v0.9.0, task release -- v0.9.0-rc.1`)
}

// --- pre-flight -------------------------------------------------------------

heading('Pre-flight')

if (!existsSync(resolve(ROOT, '.git'))) fail('not a git repository')
if (!git(['remote', 'get-url', 'origin'], { allowFail: true })) fail('no `origin` remote configured')

const branch = branchOverride || (git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }) || '').replace(/^origin\//, '') || 'main'

// Fetch first: the latest-tag and upstream-HEAD answers are only trustworthy
// against a fresh remote view, and a stale clone is how "tag already exists on
// the remote" slips through.
//
// `--prune-tags` is the load-bearing part. Plain `--prune` only prunes
// remote-tracking branches, so a tag deleted on the remote survives locally
// forever and every later attempt to release that version is refused with
// "tag already exists locally" — verified in a scratch repo, where
// `--tags --prune` left the deleted tag in place and `--prune --prune-tags`
// removed it. Anything dropped is announced rather than removed silently.
const tagsBeforeFetch = currentTags()
git(['fetch', 'origin', '--prune', '--prune-tags', '--quiet'], { allowFail: true })
const prunedTags = tagsBeforeFetch.filter((t) => !currentTags().includes(t))
if (prunedTags.length > 0) {
  ok('dropped ' + prunedTags.length + ' stale local tag(s) no longer on origin: ' + prunedTags.join(', '))
}

const dirty = git(['status', '--porcelain'], { allowFail: true })
if (dirty) {
  console.error(`\n${red('✗ working tree is not clean')}\n`)
  console.error(dirty.split('\n').slice(0, 20).map((l) => '    ' + l).join('\n'))
  const more = dirty.split('\n').length
  if (more > 20) console.error(dim(`    ... and ${more - 20} more`))
  console.error(`\n  ${dim('Commit or stash these first. A tag has to point at a commit that exists everywhere.')}\n`)
  process.exit(1)
}

const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })
if (currentBranch !== branch) {
  problems.push(`on branch \`${currentBranch}\`, expected \`${branch}\``)
} else {
  ok(`on \`${branch}\``)
}

const head = git(['rev-parse', 'HEAD'], { allowFail: true })
const upstream = git(['rev-parse', `origin/${branch}`], { allowFail: true })
if (upstream === null) {
  problems.push(`\`origin/${branch}\` does not exist — has it been pushed?`)
} else if (head !== upstream) {
  const ahead = +(git(['rev-list', '--count', `origin/${branch}..HEAD`], { allowFail: true }) || 0)
  const behind = +(git(['rev-list', '--count', `HEAD..origin/${branch}`], { allowFail: true }) || 0)
  problems.push(
    `HEAD diverges from \`origin/${branch}\`` + (ahead ? ` (${ahead} unpushed commit(s))` : '') + (behind ? ` (${behind} commit(s) behind)` : '')
  )
} else {
  ok(`HEAD matches \`origin/${branch}\``)
}

const existingTags = new Set(git(['tag', '--list'], { allowFail: true }).split('\n'))
if (existingTags.has(tag)) problems.push(`tag \`${tag}\` already exists locally`)
const remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { allowFail: true })
if (remoteTag) problems.push(`tag \`${tag}\` already exists on the remote`)

const semverTags = [...existingTags].filter((t) => parseVersion(t)).sort((a, b) => compareVersions(parseVersion(b), parseVersion(a)))
const newest = semverTags[0] || null
// `--from` overrides which tag the notes start at, for a re-release of an
// older range. Otherwise the range is "everything since the newest tag".
const latest = fromRef || newest
if (fromRef) {
  if (!existingTags.has(fromRef)) problems.push(`--from \`${fromRef}\` is not a tag in this clone`)
  else ok(`notes start at ${fromRef}`)
} else if (newest) {
  if (compareVersions(target, parseVersion(newest)) <= 0) {
    problems.push(`\`${tag}\` is not newer than the latest tag \`${newest}\``)
  } else {
    ok(`${tag} is newer than ${newest}`)
  }
} else {
  warn('no semver tag found in this clone — this will be the first')
}

if (problems.length > 0) {
  console.error(`\n${red('✗ cannot release yet')}\n`)
  for (const p of problems) console.error(`  ${red('•')} ${p}`)
  console.error('')
  process.exit(1)
}

// --- checks -----------------------------------------------------------------

if (!skipChecks) {
  heading('Checks')
  // `task lint` runs eslint with --fix, so it can dirty the tree. That is why
  // it runs before the cleanliness re-check below rather than after the tag.
  for (const t of ['lint', 'test']) {
    detail(`task ${t}`)
    const res = spawnSync('task', [t], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    if (res.status !== 0) fail(`\`task ${t}\` failed — release aborted before anything was tagged or pushed`)
  }

  // Re-check: lint's --fix may have rewritten files, and tagging now would
  // release a commit that is missing those changes while the tree still holds
  // them.
  const after = git(['status', '--porcelain'], { allowFail: true })
  if (after) {
    fail(
      'the checks modified the working tree — review and commit the changes, then run the release again:\n' +
        after.split('\n').map((l) => '    ' + l).join('\n')
    )
  }
  ok('tree still clean after lint + test')
} else {
  heading('Checks')
  warn('skipped via --skip-checks — the release is unverified')
}

// --- the notes --------------------------------------------------------------

// The range ends at the commit being tagged, not at the tag: the tag does not
// exist yet at this point, so `v0.8.1..v0.9.0` fails to resolve and silently
// reports an empty release.
const changelog = renderNotes(latest, resolveTo(toRef || head), { includeBots })
const commitCount = +(git(['rev-list', '--count', latest ? `${latest}..${toRef || head}` : head], { allowFail: true }) || 0)

// The tag message is the changelog itself, so `git show v0.9.0` carries the same
// notes as the release page. CI feeds the identical text to the release body via
// --notes-only, which keeps one implementation and no way for the two to drift.
let tagMessage = message
if (!tagMessage) tagMessage = changelog.text

if (changelog.hidden.bots || changelog.hidden.types) {
  warn(`hidden ${changelog.hidden.bots} bot commit(s) and ${changelog.hidden.types} ci/style commit(s) — \`--all\` includes them`)
}

heading('Release')
ok(`${tag}  ${dim(`${commitCount} commit(s) since ${latest ?? 'the beginning'}`)}`)
console.log(`\n${dim(changelog.text)}`)

const slug = (git(['config', '--get', 'remote.origin.url'], { allowFail: true }) || '').match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/)
const runUrl = slug ? `https://github.com/${slug[1]}/${slug[2]}/actions/workflows/build-release.yml` : null

if (dryRun) {
  heading('Dry run')
  detail(`git tag -a ${tag} --cleanup=whitespace -F <msg> ${head.slice(0, 7)}`)
  detail(`git push origin ${tag}`)
  console.log(`\n${yellow('nothing was tagged or pushed')}`)
  if (runUrl) console.log(`${dim('CI will run at')} ${runUrl}\n`)
  process.exit(0)
}

heading('Publish')
// `--cleanup=whitespace` is load-bearing. `git tag -m/-F` defaults to
// `--cleanup=strip`, which deletes every line starting with `#` — that silently
// eats the `## Changelog` and `### Features` headings and leaves a tag message
// of bare bullets. The message also goes through a file rather than `-m`: a
// long release would otherwise run into the OS argument-length limit, and
// execFileSync has no shell to expand or quote through.
const msgFile = resolve(tmpdir(), `oasm-release-${process.pid}.md`)
writeFileSync(msgFile, tagMessage)
detail(`git tag -a ${tag} --cleanup=whitespace -F <msg> ${head.slice(0, 7)}`)
try {
  git(['tag', '-a', tag, '--cleanup=whitespace', '-F', msgFile, head])
} finally {
  rmSync(msgFile, { force: true })
}
ok(`tagged ${tag} at ${head.slice(0, 7)}`)

detail(`git push origin ${tag}`)
try {
  execFileSync('git', ['push', 'origin', tag], { cwd: ROOT, stdio: 'inherit' })
} catch {
  // Leave the local tag in place: it is valid, and re-pushing it is the fix.
  // Deleting it here would throw away the annotated message for no gain.
  fail(`failed to push ${tag}. The local tag is intact — re-run \`git push origin ${tag}\` once the cause is fixed`)
}
ok(`pushed ${tag}`)

console.log(`\n${bold('Next')}`)
console.log(`  1. CI is building now ${runUrl ? dim('(' + runUrl + ')') : ''}`)
console.log(`     ${dim('worker binaries + draft release + 3 multi-arch images')}`)
console.log(`  2. Review the draft release: ${dim('releases → ' + tag)}`)
console.log(`  3. Publish it ${dim('(the workflow deliberately leaves it as a draft)')}`)
if (notes.length > 0) {
  console.log('')
  for (const n of notes) console.log(`  ${yellow('!')} ${n}`)
}
console.log('')
