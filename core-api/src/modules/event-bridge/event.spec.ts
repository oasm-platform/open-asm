import { AUDIT_ACTION_CATALOG } from '../audit/constants/audit-events';
import {
  EVENT_CATALOG,
  EVENT_CATALOG_TOKEN,
  EVENT_DEFINITIONS,
  EVENT_NAMES,
  EVENT_SCHEMA_VERSION,
  getEventDefinition,
  isEventName,
  resolveEventName,
  type CatalogEvent,
} from '../connectors/event';

/**
 * The catalog is hand-maintained, so the risks are (a) it drifts from the audit
 * dictionary it mirrors, (b) a hand edit breaks the naming contract, and (c)
 * the flattened view and the literal tree disagree. All three fail here rather
 * than as a message nobody can read on a stream.
 *
 * These are runtime assertions only. The `EventName` literal union is enforced
 * by the compiler instead: `task api:build` type-checks non-spec sources, and
 * `publish('job.startd')` fails there. Specs are excluded from that build
 * (tsconfig.build.json) and jest strips types via SWC, so a type-level
 * assertion written in THIS file would never run — the tree being the only
 * source is what makes the union trustworthy.
 * Run: task api:test:one SPEC=src/modules/event-bridge/event.spec.ts
 */
describe('event catalog', () => {
  describe('naming contract', () => {
    it('declares every name exactly once', () => {
      const duplicates = EVENT_NAMES.filter(
        (name, index) => EVENT_NAMES.indexOf(name) !== index,
      );
      expect(duplicates).toEqual([]);
    });

    // Same regex the audit dictionary enforces, so a consumer that can parse an
    // audit action can parse an event name.
    it.each(EVENT_DEFINITIONS.map((entry) => [entry.name]))(
      '%s matches resource(.sub_resource).action',
      (name) => {
        expect(name).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      },
    );

    it('gives every event a non-empty summary', () => {
      for (const { summary } of EVENT_DEFINITIONS) {
        expect(summary.length).toBeGreaterThan(0);
      }
    });

    // `isLeaf` in event.ts discriminates on the presence of `summary`, so an
    // event named `summary.*` would be walked as a description instead of a
    // node. Nothing is named that today; this says so out loud. A leaf's own
    // `summary` string is expected — only a NODE called `summary` is the bug.
    it('uses no event name segment called "summary"', () => {
      const offenders: string[] = [];
      const walk = (node: object, prefix: string): void => {
        for (const [key, value] of Object.entries(node)) {
          if (typeof value !== 'object' || value === null) {
            continue; // a leaf's scalar fields; nothing below it
          }
          const name = prefix ? `${prefix}.${key}` : key;
          if (key === 'summary') {
            offenders.push(name);
            continue;
          }
          walk(value, name);
        }
      };
      walk(EVENT_CATALOG, '');
      expect(offenders).toEqual([]);
    });
  });

  describe('tree ↔ flat agreement', () => {
    // The tree is the authored source; EVENT_DEFINITIONS is derived. If the
    // walk ever stops matching the shape, these fail rather than the bridge
    // publishing half a catalog.
    it('exposes 86 leaves', () => {
      expect(EVENT_DEFINITIONS).toHaveLength(86);
    });

    // The load-bearing guarantee of the dot-path call shape. `publish` reads
    // `leaf.name`, but the path is what a human reads and types. If the two
    // ever disagree, events land in the stream under a name the catalog does
    // not document — silently, because both halves are individually valid.
    it('gives every leaf a name equal to its dotted path', () => {
      const mismatched: { path: string; leafName: string }[] = [];
      const walk = (node: object, prefix: string): void => {
        for (const [key, value] of Object.entries(node)) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (typeof value !== 'object' || value === null) {
            continue;
          }
          const leaf = value as { name?: string; summary?: string };
          if (typeof leaf.summary === 'string') {
            if (leaf.name !== path) {
              mismatched.push({ path, leafName: leaf.name ?? '<missing>' });
            }
          } else {
            walk(value, path);
          }
        }
      };
      walk(EVENT_CATALOG, '');
      expect(mismatched).toEqual([]);
    });

    it('gives every leaf a name the catalog accepts', () => {
      for (const entry of EVENT_DEFINITIONS) {
        expect(isEventName(entry.name)).toBe(true);
      }
    });

    it('reads each leaf back through its dotted path', () => {
      for (const { name, summary } of EVENT_DEFINITIONS) {
        const leaf = name
          .split('.')
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            EVENT_CATALOG,
          );
        expect(leaf).toEqual({ name, summary });
      }
    });

    it('produces only names the tree can spell', () => {
      // The walk builds names by joining path segments, so a name it emits is
      // in the tree by construction — this asserts the round trip anyway,
      // because EVENT_NAMES is what publish() validates against and a
      // phantom entry there would be an event the catalog does not describe.
      const spellable = new Set<string>();
      const walk = (node: object, prefix: string): void => {
        for (const [key, value] of Object.entries(node)) {
          const name = prefix ? `${prefix}.${key}` : key;
          if (typeof value === 'object' && value !== null) {
            if ('summary' in value) {
              spellable.add(name);
            } else {
              walk(value, name);
            }
          }
        }
      };
      walk(EVENT_CATALOG, '');

      const phantom = EVENT_NAMES.filter((name) => !spellable.has(name));
      expect(phantom).toEqual([]);
    });

    it('derives the domain as the first path segment', () => {
      const domains = new Set(EVENT_NAMES.map((name) => name.split('.')[0]));
      // 19 domains: workspace, member, permission_group, target, asset,
      // asset_group, network, vulnerability, report, job, workflow,
      // integration, api_key, audit, worker, scan, issue, statistics,
      // system_config, storage, notification.
      expect(domains.size).toBe(Object.keys(EVENT_CATALOG).length);
    });
  });

  describe('audit parity', () => {
    // The whole point of the audit section: 1:1 with the trail. If a new audit
    // action lands without a catalog leaf, the bridge silently stops emitting
    // it — this is the guard that says so at build time.
    it('covers every audit action', () => {
      const missing = AUDIT_ACTION_CATALOG.map((a) => a.action).filter(
        (action) => !EVENT_NAMES.includes(action as EventName),
      );
      expect(missing).toEqual([]);
    });

    it('carries the audit action count', () => {
      expect(AUDIT_ACTION_CATALOG).toHaveLength(35);
    });
  });

  describe('lookups', () => {
    // The two shapes `publish` must accept, and the one it must refuse.
    it.each([
      ['a catalog leaf', EVENT_CATALOG.job.completed, 'job.completed'],
      [
        'a catalog leaf at depth 3',
        EVENT_CATALOG.workspace.config.updated,
        'workspace.config.updated',
      ],
      ['a bare name', 'job.completed', 'job.completed'],
    ] as const)('resolves %s to its wire name', (_label, event, expected) => {
      expect(resolveEventName(event)).toBe(expected);
    });

    it('refuses an unknown name', () => {
      expect(resolveEventName('job.startd')).toBeUndefined();
    });

    it('refuses a hand-rolled leaf whose name is not in the catalog', () => {
      // Reachable at runtime even though the compiler blocks it, because a
      // value can be cast or deserialized. `resolveEventName` is the backstop.
      const forged = { name: 'typo.event', summary: 'x' };
      expect(resolveEventName(forged as CatalogEvent)).toBeUndefined();
    });

    it('finds a definition by name', () => {
      expect(getEventDefinition('job.completed')).toEqual({
        name: 'job.completed',
        summary: 'Job completed successfully',
      });
    });

    it('resolves a three-segment name', () => {
      expect(getEventDefinition('workspace.config.updated')).toEqual({
        name: 'workspace.config.updated',
        summary: 'Workspace configuration updated',
      });
    });

    it('returns undefined for a name outside the catalog', () => {
      expect(getEventDefinition('job.startd')).toBeUndefined();
    });

    it.each([
      ['job.completed', true],
      ['job.startd', false],
      ['totally.made.up', false],
    ] as const)('isEventName(%s) === %s', (value, expected) => {
      expect(isEventName(value)).toBe(expected);
    });

    it('filters a domain by name prefix, the documented consumer path', () => {
      const workerEvents = EVENT_NAMES.filter((name) =>
        name.startsWith('worker.'),
      );
      expect(workerEvents).toContain('worker.joined');
      expect(workerEvents).not.toContain('job.completed');
    });

    it('publishes a schema version for consumers to switch on', () => {
      expect(EVENT_SCHEMA_VERSION).toBe(1);
    });

    it('exposes the catalog under a DI token', () => {
      // Identity is the contract: consumers must get this exact catalog, not
      // a copy that can drift.
      expect(EVENT_CATALOG_TOKEN.description).toBe('EVENT_CATALOG');
    });
  });
});
