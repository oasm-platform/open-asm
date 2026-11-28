import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

/**
 * Architecture ratchet: pins the module coupling `core-api` has today so it
 * can only be paid down on purpose, never grow by accident.
 *
 * Each list below is the exact current state. A change that adds a global
 * module, a `forwardRef`, a foreign entity registration or a cross-module
 * import fails here until the list is updated in the same change, which puts
 * the new coupling in front of the reviewer. A change that removes one fails
 * too, so the list never keeps slack: delete the entry.
 */

const SRC = __dirname;

/** Source files, without specs and migrations. */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return path === join(SRC, 'database', 'migrations') ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

const toPosix = (path: string) => relative(SRC, path).split(sep).join('/');

/**
 * `modules/<name>` for a domain module, `app` for the composition root
 * (`main.ts`, `app.module.ts`, `modules/combine.module.ts`), else the
 * top-level folder (`common`, `services`, `mcp`, ...).
 */
function areaOf(path: string): string {
  const parts = toPosix(path).split('/');
  if (parts[0] === 'modules') return parts.length > 2 ? `modules/${parts[1]}` : 'app';
  return parts.length > 1 ? parts[0] : 'app';
}

const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every `import ... from` / `export ... from` specifier with its bindings. */
function importsOf(code: string): { names: string[]; from: string }[] {
  const pattern = /(?:import|export)\s+(?:type\s+)?([^'";]*?)\s*from\s+'([^']+)'/g;
  return [...code.matchAll(pattern)].map(([, clause, from]) => ({
    from,
    names: (clause.match(/\{([\s\S]*)\}/)?.[1] ?? clause)
      .split(',')
      .map((name) => name.replace(/^type\s+/, '').trim().split(/\s+as\s+/).pop() ?? '')
      .filter(Boolean),
  }));
}

function resolveSpecifier(file: string, from: string): string | undefined {
  if (from.startsWith('@/')) return join(SRC, from.slice(2));
  if (from.startsWith('.')) return resolve(dirname(file), from);
  return undefined;
}

const files = sourceFiles().map((path) => ({
  path,
  area: areaOf(path),
  code: withoutComments(readFileSync(path, 'utf8')),
}));

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

describe('architecture ratchet', () => {
  it('keeps the set of @Global() modules', () => {
    const global = files
      .filter(({ path, code }) => path.endsWith('.module.ts') && code.includes('@Global()'))
      .map(({ path }) => toPosix(path));

    expect(sorted(global)).toEqual(GLOBAL_MODULES);
  });

  it('keeps the forwardRef count per file', () => {
    const counts = files.flatMap(({ path, code }) => {
      const count = code.match(/forwardRef\(/g)?.length ?? 0;
      return count > 0 ? [`${toPosix(path)}: ${count}`] : [];
    });

    expect(sorted(counts)).toEqual(FORWARD_REFS);
  });

  it('keeps the entities a module registers from another module', () => {
    const foreign = files
      .filter(({ path }) => path.endsWith('.module.ts'))
      .flatMap(({ path, area, code }) => {
        const owners = new Map<string, string>();
        for (const { names, from } of importsOf(code)) {
          const target = resolveSpecifier(path, from);
          if (target) names.forEach((name) => owners.set(name, areaOf(target)));
        }
        return [...code.matchAll(/TypeOrmModule\.forFeature\(\s*\[([\s\S]*?)\]/g)]
          .flatMap(([, list]) => list.split(',').map((name) => name.trim()))
          .filter((name) => name && owners.has(name) && owners.get(name) !== area)
          .map((name) => `${area} <- ${name} (${owners.get(name)})`);
      });

    expect(sorted(foreign)).toEqual(FOREIGN_ENTITIES);
  });

  it('keeps the imports that reach into a domain module from elsewhere', () => {
    // The composition root wires every module in; that is its job
    const edges = files.filter(({ area }) => area !== 'app').flatMap(({ path, area, code }) =>
      importsOf(code).flatMap(({ from }) => {
        const target = resolveSpecifier(path, from);
        if (!target) return [];
        const targetArea = areaOf(target);
        return targetArea.startsWith('modules/') && targetArea !== area
          ? [`${area} -> ${targetArea}`]
          : [];
      }),
    );

    expect(sorted(edges)).toEqual(CROSS_MODULE_IMPORTS);
  });
});

/** Modules marked @Global(). Only cross-cutting infrastructure should stay. */
const GLOBAL_MODULES = [
  'database/database.module.ts',
  'modules/audit/audit.module.ts',
  'modules/auth/auth.module.ts',
  'modules/event-bridge/event-bridge.module.ts',
  'modules/workspaces/workspaces.module.ts',
  'services/services.module.ts',
];

/** `forwardRef(` per file: each one is a dependency cycle being papered over. */
const FORWARD_REFS: string[] = [];

/**
 * `<module> <- <Entity> (<owner>)`: a repository used outside its own module.
 * Each entry says why. `read` entries are lookups or read models; `WRITE`
 * entries are the exceptions to "only the owning module writes its table",
 * each blocked from going through the owner by the dependency direction or
 * by a transaction the owner does not take part in. A new WRITE entry needs
 * the same kind of reason, or a call to the owning service instead.
 */
const FOREIGN_ENTITIES = [
  // WRITE: admin bootstrap sets the first admin's role and removes a
  // half-created one (better-auth owns accounts, no service writes users)
  'modules/admin <- User (modules/auth)',
  // WRITE: platform admins update and archive any tenant's workspace,
  // outside membership rules
  'modules/admin <- Workspace (modules/workspaces)',
  // read: the conversation's project, for the prompt context
  'modules/agents <- Project (modules/projects)',
  // read: the user's default LLM for tag suggestions
  'modules/assets <- AgentConfig (modules/agents)',
  'modules/assets <- AgentLLMConfig (modules/agents)',
  // read: tenant scope of asset queries
  'modules/assets <- Target (modules/targets)',
  // read: the commented issue / finding must exist in the workspace
  'modules/comments <- Issue (modules/issues)',
  'modules/comments <- Vulnerability (modules/vulnerabilities)',
  // WRITE: the audit lane is the writer of audit_events (with AuditService's
  // in-transaction rows)
  'modules/event-bridge <- AuditEvent (modules/audit)',
  // WRITE: the notifications lane is the write side of notifications;
  // NotificationsModule is the read side
  'modules/event-bridge <- Notification (modules/notifications)',
  'modules/event-bridge <- NotificationRecipient (modules/notifications)',
  // read: recipients of a notification
  'modules/event-bridge <- User (modules/auth)',
  // read: Telegram pairing resolves the user
  'modules/integrations <- User (modules/auth)',
  // read: project scope rules select assets
  'modules/projects <- Asset (modules/assets)',
  // WRITE: project-owned workflows (project-<id>-<uuid>.yaml) are created,
  // edited and deleted with their bindings in the project's transactions
  'modules/projects <- Workflow (modules/workflows)',
  // read model: global search
  'modules/search <- Vulnerability (modules/vulnerabilities)',
  // read: a GIT_ORG target must name a SOURCE_CODE integration
  'modules/targets <- Integration (modules/integrations)',
  // read: custom templates and the project assets a template run targets
  'modules/templates <- Artifact (modules/artifacts)',
  'modules/templates <- ProjectAsset (modules/projects)',
  // read model: available workers per tool (workers imports tools)
  'modules/tools <- WorkerInstance (modules/workers)',
  // WRITE: seeds the bot user (no service owns user rows besides better-auth)
  'modules/users <- User (modules/auth)',
  // read: GIT_ORG and host targets of a scan request
  'modules/vulnerabilities <- Target (modules/targets)',
  // WRITE: conversation -> worker pin (agents imports workers)
  'modules/workers <- AgentConversation (modules/agents)',
  // read: the network a worker joins must be in its workspace
  'modules/workers <- InternalNetwork (modules/internal-networks)',
  // WRITE: a lost or rejoining worker's jobs go back to PENDING
  // (jobs-registry imports workers)
  'modules/workers <- Job (modules/jobs-registry)',
  // WRITE: a worker records its interfaces on an internal network
  // (internal-networks reaches workers through targets and jobs-registry)
  'modules/workers <- NetworkInterface (modules/internal-networks)',
  // read: a workflow step's tool must exist and fit
  'modules/workflows <- Tool (modules/tools)',
  // read: default workflows are synced for every workspace at boot
  'modules/workflows <- Workspace (modules/workspaces)',
  // WRITE: WorkspaceEncryptionService is the store of workspace DEKs
  'services <- Workspace (modules/workspaces)',
];

/** `<area> -> <module>`: every place that imports from another domain module. */
const CROSS_MODULE_IMPORTS = [
  'bootstrap -> modules/auth',
  'common -> modules/assets',
  'common -> modules/auth',
  'common -> modules/jobs-registry',
  'common -> modules/vulnerabilities',
  'common -> modules/workers',
  'common -> modules/workspaces',
  'mcp -> modules/agents',
  'mcp -> modules/apikeys',
  'modules/admin -> modules/artifacts',
  'modules/admin -> modules/auth',
  'modules/admin -> modules/event-bridge',
  'modules/admin -> modules/storage',
  'modules/admin -> modules/tools',
  'modules/admin -> modules/workspaces',
  'modules/agents -> modules/artifacts',
  'modules/agents -> modules/attack-surface-query',
  'modules/agents -> modules/auth',
  'modules/agents -> modules/connectors',
  'modules/agents -> modules/event-bridge',
  'modules/agents -> modules/issues',
  'modules/agents -> modules/jobs-registry',
  'modules/agents -> modules/projects',
  'modules/agents -> modules/remote-execute',
  'modules/agents -> modules/statistic',
  'modules/agents -> modules/targets',
  'modules/agents -> modules/templates',
  'modules/agents -> modules/tools',
  'modules/agents -> modules/vulnerabilities',
  'modules/agents -> modules/workers',
  'modules/agents -> modules/workspaces',
  'modules/artifacts -> modules/auth',
  'modules/artifacts -> modules/event-bridge',
  'modules/artifacts -> modules/storage',
  'modules/artifacts -> modules/workspaces',
  'modules/assets -> modules/agents',
  'modules/assets -> modules/event-bridge',
  'modules/assets -> modules/jobs-registry',
  'modules/assets -> modules/projects',
  'modules/assets -> modules/storage',
  'modules/assets -> modules/targets',
  'modules/assets -> modules/technology',
  'modules/assets -> modules/tools',
  'modules/assets -> modules/vulnerabilities',
  'modules/assets -> modules/workflows',
  'modules/assets -> modules/workspaces',
  'modules/attack-surface-query -> modules/assets',
  'modules/attack-surface-query -> modules/auth',
  'modules/attack-surface-query -> modules/vulnerabilities',
  'modules/attack-surface-query -> modules/workspaces',
  'modules/audit -> modules/event-bridge',
  'modules/auth -> modules/workspaces',
  'modules/comments -> modules/auth',
  'modules/comments -> modules/event-bridge',
  'modules/comments -> modules/issues',
  'modules/comments -> modules/vulnerabilities',
  'modules/connectors -> modules/storage',
  'modules/connectors -> modules/tools',
  'modules/data-adapter -> modules/assets',
  'modules/data-adapter -> modules/event-bridge',
  'modules/data-adapter -> modules/jobs-registry',
  'modules/data-adapter -> modules/storage',
  'modules/data-adapter -> modules/vulnerabilities',
  'modules/data-adapter -> modules/workspaces',
  'modules/event-bridge -> modules/audit',
  'modules/event-bridge -> modules/auth',
  'modules/event-bridge -> modules/notifications',
  'modules/events -> modules/event-bridge',
  'modules/events -> modules/workspaces',
  'modules/integrations -> modules/assets',
  'modules/integrations -> modules/auth',
  'modules/integrations -> modules/data-adapter',
  'modules/integrations -> modules/event-bridge',
  'modules/integrations -> modules/projects',
  'modules/integrations -> modules/targets',
  'modules/integrations -> modules/workspaces',
  'modules/internal-networks -> modules/auth',
  'modules/internal-networks -> modules/event-bridge',
  'modules/internal-networks -> modules/targets',
  'modules/internal-networks -> modules/workers',
  'modules/internal-networks -> modules/workspaces',
  'modules/issues -> modules/auth',
  'modules/issues -> modules/comments',
  'modules/issues -> modules/event-bridge',
  'modules/issues -> modules/vulnerabilities',
  'modules/issues -> modules/workspaces',
  'modules/jobs-registry -> modules/artifacts',
  'modules/jobs-registry -> modules/assets',
  'modules/jobs-registry -> modules/connectors',
  'modules/jobs-registry -> modules/data-adapter',
  'modules/jobs-registry -> modules/event-bridge',
  'modules/jobs-registry -> modules/integrations',
  'modules/jobs-registry -> modules/projects',
  'modules/jobs-registry -> modules/storage',
  'modules/jobs-registry -> modules/targets',
  'modules/jobs-registry -> modules/tools',
  'modules/jobs-registry -> modules/vulnerabilities',
  'modules/jobs-registry -> modules/workers',
  'modules/jobs-registry -> modules/workflows',
  'modules/jobs-registry -> modules/workspaces',
  'modules/notifications -> modules/auth',
  'modules/notifications -> modules/event-bridge',
  'modules/notifications -> modules/workspaces',
  'modules/projects -> modules/artifacts',
  'modules/projects -> modules/assets',
  'modules/projects -> modules/connectors',
  'modules/projects -> modules/event-bridge',
  'modules/projects -> modules/jobs-registry',
  'modules/projects -> modules/storage',
  'modules/projects -> modules/tools',
  'modules/projects -> modules/vulnerabilities',
  'modules/projects -> modules/workflows',
  'modules/projects -> modules/workspaces',
  'modules/providers -> modules/auth',
  'modules/providers -> modules/tools',
  'modules/remote-execute -> modules/workers',
  'modules/reports -> modules/artifacts',
  'modules/reports -> modules/attack-surface-query',
  'modules/reports -> modules/auth',
  'modules/reports -> modules/event-bridge',
  'modules/reports -> modules/projects',
  'modules/reports -> modules/statistic',
  'modules/reports -> modules/storage',
  'modules/reports -> modules/targets',
  'modules/reports -> modules/workspaces',
  'modules/root -> modules/admin',
  'modules/root -> modules/storage',
  'modules/root -> modules/users',
  'modules/search -> modules/assets',
  'modules/search -> modules/auth',
  'modules/search -> modules/targets',
  'modules/search -> modules/vulnerabilities',
  'modules/statistic -> modules/assets',
  'modules/statistic -> modules/event-bridge',
  'modules/statistic -> modules/jobs-registry',
  'modules/statistic -> modules/notifications',
  'modules/statistic -> modules/targets',
  'modules/statistic -> modules/technology',
  'modules/statistic -> modules/vulnerabilities',
  'modules/statistic -> modules/workflows',
  'modules/statistic -> modules/workspaces',
  'modules/storage -> modules/workspaces',
  'modules/targets -> modules/assets',
  'modules/targets -> modules/audit',
  'modules/targets -> modules/event-bridge',
  'modules/targets -> modules/integrations',
  'modules/targets -> modules/internal-networks',
  'modules/targets -> modules/jobs-registry',
  'modules/targets -> modules/projects',
  'modules/targets -> modules/vulnerabilities',
  'modules/targets -> modules/workflows',
  'modules/targets -> modules/workspaces',
  'modules/technology -> modules/storage',
  'modules/templates -> modules/artifacts',
  'modules/templates -> modules/event-bridge',
  'modules/templates -> modules/jobs-registry',
  'modules/templates -> modules/projects',
  'modules/templates -> modules/storage',
  'modules/templates -> modules/tools',
  'modules/tools -> modules/apikeys',
  'modules/tools -> modules/assets',
  'modules/tools -> modules/connectors',
  'modules/tools -> modules/event-bridge',
  'modules/tools -> modules/jobs-registry',
  'modules/tools -> modules/providers',
  'modules/tools -> modules/storage',
  'modules/tools -> modules/vulnerabilities',
  'modules/tools -> modules/workers',
  'modules/tools -> modules/workspaces',
  'modules/users -> modules/auth',
  'modules/vulnerabilities -> modules/agents',
  'modules/vulnerabilities -> modules/assets',
  'modules/vulnerabilities -> modules/auth',
  'modules/vulnerabilities -> modules/event-bridge',
  'modules/vulnerabilities -> modules/jobs-registry',
  'modules/vulnerabilities -> modules/notifications',
  'modules/vulnerabilities -> modules/projects',
  'modules/vulnerabilities -> modules/targets',
  'modules/vulnerabilities -> modules/tools',
  'modules/vulnerabilities -> modules/workflows',
  'modules/vulnerabilities -> modules/workspaces',
  'modules/workers -> modules/agents',
  'modules/workers -> modules/connectors',
  'modules/workers -> modules/event-bridge',
  'modules/workers -> modules/internal-networks',
  'modules/workers -> modules/jobs-registry',
  'modules/workers -> modules/tools',
  'modules/workers -> modules/workspaces',
  'modules/workflows -> modules/auth',
  'modules/workflows -> modules/event-bridge',
  'modules/workflows -> modules/jobs-registry',
  'modules/workflows -> modules/projects',
  'modules/workflows -> modules/targets',
  'modules/workflows -> modules/tools',
  'modules/workflows -> modules/workspaces',
  'modules/workspaces -> modules/apikeys',
  'modules/workspaces -> modules/artifacts',
  'modules/workspaces -> modules/audit',
  'modules/workspaces -> modules/auth',
  'modules/workspaces -> modules/event-bridge',
  'modules/workspaces -> modules/jobs-registry',
  'modules/workspaces -> modules/notifications',
  'modules/workspaces -> modules/targets',
  'services -> modules/workspaces',
];
