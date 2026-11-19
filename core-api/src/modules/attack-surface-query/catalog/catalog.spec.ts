import { assertCatalog, buildCatalog, CATALOG, checkFieldValue, describeCatalog, fieldOps, OP_VALUE_SHAPE } from './catalog';
import type { ResourceDef } from './catalog.types';
import { RESOURCES, servicesResource } from './resources';

const clone = (res: ResourceDef, patch: Partial<ResourceDef>): ResourceDef => ({ ...res, ...patch });

describe('catalog boot check', () => {
  it('accepts the shipped catalog', () => {
    expect(() => assertCatalog(CATALOG)).not.toThrow();
  });

  it('refuses a global resource used as a root', () => {
    const bad = RESOURCES.map((r) => (r.name === 'tools' ? clone(r, { root: true }) : r));
    expect(() => assertCatalog(buildCatalog(bad))).toThrow(/global resource cannot be a root/);
  });

  it('refuses a field reaching an undeclared alias', () => {
    const bad = clone(servicesResource, {
      fields: { ...servicesResource.fields, leak: { sql: '{one:host}.value', type: 'text', description: 'x' } },
    });
    const catalog = buildCatalog(RESOURCES.map((r) => (r.name === 'services' ? bad : r)));
    expect(() => assertCatalog(catalog)).toThrow(/without declaring it/);
  });

  it('refuses a relation to an unknown resource', () => {
    const bad = clone(servicesResource, {
      one: { ...servicesResource.one, ghost: { resource: 'nope', description: '', on: '{b}.id = {a}.id', join: 'inner' } },
    });
    const catalog = buildCatalog(RESOURCES.map((r) => (r.name === 'services' ? bad : r)));
    expect(() => assertCatalog(catalog)).toThrow(/unknown resource "nope"/);
  });

  it('refuses a project scope without the project placeholder', () => {
    const bad = clone(servicesResource, { projectScope: 'true' });
    const catalog = buildCatalog(RESOURCES.map((r) => (r.name === 'services' ? bad : r)));
    expect(() => assertCatalog(catalog)).toThrow(/projectScope must use \{project\}/);
  });

  it.each([
    ['without the workspace parameter', 'EXISTS (SELECT 1 FROM "targets" t WHERE t.id = {a}."targetId" AND t."workspaceId" IS NOT NULL)'],
    ['without a workspace column', 'EXISTS (SELECT 1 FROM "targets" t WHERE t.id = {a}."targetId" AND t.id = {ws})'],
    ['with another placeholder', 'EXISTS (SELECT 1 FROM "targets" t WHERE t.id = {a}."targetId" AND t."workspaceId" = {ws} AND {project} IS NULL)'],
  ])('refuses a scope predicate %s', (_label, scopePredicate) => {
    const catalog = buildCatalog(RESOURCES.map((r) => (r.name === 'services' ? clone(servicesResource, { scopePredicate }) : r)));
    expect(() => assertCatalog(catalog)).toThrow(/scopePredicate/);
  });

  it('accepts a scope predicate that compares a workspace column with {ws}', () => {
    const scopePredicate = 'EXISTS (SELECT 1 FROM "targets" t WHERE t.id = {a}."targetId" AND t."workspaceId" = {ws})';
    const catalog = buildCatalog(RESOURCES.map((r) => (r.name === 'services' ? clone(servicesResource, { scopePredicate }) : r)));
    expect(() => assertCatalog(catalog)).not.toThrow();
  });
});

describe('field operators', () => {
  it('adds the null tests to nullable fields only', () => {
    expect(fieldOps(CATALOG.services.fields.lastSeen)).toEqual(expect.arrayContaining(['isNull', 'isNotNull']));
    expect(fieldOps(CATALOG.services.fields.port)).not.toContain('isNull');
  });

  it('describes every operator with its value shape', () => {
    for (const res of Object.values(CATALOG)) {
      for (const field of Object.values(res.fields)) {
        for (const op of fieldOps(field)) expect(OP_VALUE_SHAPE[op]).toBeDefined();
      }
    }
  });
});

describe('checkFieldValue', () => {
  const port = servicesResource.fields.port;
  it('checks type, enum and the field check', () => {
    expect(checkFieldValue(port, '443', 'eq')).toBe(true);
    expect(checkFieldValue(port, '70000', 'eq')).toBe(false);
    expect(checkFieldValue(port, 'abc', 'eq')).toBe(false);
    const severity = CATALOG.vulnerabilities.fields.severity;
    expect(checkFieldValue(severity, 'critical', 'eq')).toBe(true);
    expect(checkFieldValue(severity, 'urgent', 'eq')).toBe(false);
  });

  it('refuses IPs with a zone id and accepts CIDRs only for inSubnet', () => {
    const ip = CATALOG.ips.fields.ip;
    expect(checkFieldValue(ip, '10.0.0.1', 'eq')).toBe(true);
    expect(checkFieldValue(ip, 'fe80::1%eth0', 'eq')).toBe(false);
    expect(checkFieldValue(ip, '10.0.0.0/16', 'inSubnet')).toBe(true);
    expect(checkFieldValue(ip, '10.0.0.0/33', 'inSubnet')).toBe(false);
  });
});

describe('describeCatalog', () => {
  it('never exposes SQL or table names', () => {
    const json = JSON.stringify(describeCatalog(CATALOG, () => true));
    expect(json).not.toMatch(/asset_services|http_responses|\{a\}|SELECT/);
  });

  it('hides resources the caller cannot read, and global ones', () => {
    const names = describeCatalog(CATALOG, (p) => p === 'asset.read').map((r) => r.name);
    expect(names).toContain('services');
    expect(names).not.toContain('vulnerabilities');
    expect(names).not.toContain('targets');
    expect(names).not.toContain('tools');
    const hosts = describeCatalog(CATALOG, (p) => p === 'asset.read').find((r) => r.name === 'hosts')!;
    expect(hosts.many.map((m) => m.name)).not.toContain('vulnerabilities');
  });
});
