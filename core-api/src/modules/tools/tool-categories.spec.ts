import { TargetType, ToolCategory } from '@/common/enums/enum';
import {
  capabilityToCategory,
  connectorCategories,
  parseManifestCategories,
  resolveToolCategory,
  sameCategories,
} from './tool-categories';

const HOST = [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR];

describe('capabilityToCategory', () => {
  it.each([
    ['subdomains', ToolCategory.SUBDOMAINS],
    ['port_scanner', ToolCategory.PORTS_SCANNER],
    ['secrets', ToolCategory.VULNERABILITIES],
    ['URL_DISCOVERY', ToolCategory.URL_DISCOVERY],
  ])('%s → %s', (cap, cat) => expect(capabilityToCategory(cap)).toBe(cat));

  it('returns undefined for an unknown capability', () => {
    expect(capabilityToCategory('teleport')).toBeUndefined();
  });
});

describe('parseManifestCategories', () => {
  it('maps capabilities in manifest order with their own target types', () => {
    const { categories } = parseManifestCategories([
      { name: 'ports_scanner', targetTypes: ['domain', 'ip', 'cidr'] },
      { name: 'vulnerabilities', targetTypes: ['domain'] },
    ]);
    expect(categories).toEqual([
      { name: ToolCategory.PORTS_SCANNER, targetTypes: HOST },
      { name: ToolCategory.VULNERABILITIES, targetTypes: [TargetType.DOMAIN] },
    ]);
  });

  it('merges capabilities that map to the same category', () => {
    const { categories } = parseManifestCategories([
      { name: 'secrets', targetTypes: ['git_org'] },
      { name: 'vulnerabilities', targetTypes: ['ip'] },
    ]);
    expect(categories).toEqual([
      {
        name: ToolCategory.VULNERABILITIES,
        targetTypes: [TargetType.GIT_ORG, TargetType.IP],
      },
    ]);
  });

  it('keeps known categories and reports unknown capabilities', () => {
    const result = parseManifestCategories([
      { name: 'teleport', targetTypes: ['ip'] },
      { name: 'ports_scanner', targetTypes: ['ip'] },
    ]);
    expect(result.categories.map((c) => c.name)).toEqual([
      ToolCategory.PORTS_SCANNER,
    ]);
    expect(result.skipped).toEqual(['teleport (unknown capability)']);
  });

  it('skips a capability without usable target types instead of defaulting to hosts', () => {
    const result = parseManifestCategories([
      'secrets', // old bare-string shape
      { name: 'sca' },
      { name: 'sast', targetTypes: ['mainframe'] },
    ]);
    expect(result.categories).toEqual([]);
    expect(result.skipped).toEqual([
      'secrets (no targetTypes)',
      'sca (no targetTypes)',
      'sast (no targetTypes)',
    ]);
    expect(result.unknownTargetTypes).toEqual(['mainframe']);
  });

  it('returns nothing for a missing capabilities list', () => {
    expect(parseManifestCategories(undefined).categories).toEqual([]);
  });
});

describe('connectorCategories', () => {
  it('carries each capability inputsSchema; merged categories keep the first schema', () => {
    const schema = { type: 'object' };
    expect(
      connectorCategories([
        { name: 'ports_scanner', targetTypes: ['ip'], inputsSchema: schema },
        { name: 'secrets', targetTypes: ['git_org'] },
        {
          name: 'sca',
          targetTypes: ['git_org'],
          inputsSchema: { type: 'string' },
        },
      ]),
    ).toEqual([
      {
        name: ToolCategory.PORTS_SCANNER,
        targetTypes: [TargetType.IP],
        inputsSchema: schema,
      },
      {
        name: ToolCategory.VULNERABILITIES,
        targetTypes: [TargetType.GIT_ORG],
        inputsSchema: { type: 'string' },
      },
    ]);
  });
});

describe('resolveToolCategory', () => {
  const tool = {
    name: 'nmap',
    categories: [
      { name: ToolCategory.PORTS_SCANNER, targetTypes: HOST },
      { name: ToolCategory.VULNERABILITIES, targetTypes: [TargetType.DOMAIN] },
    ],
  };

  it('defaults to the first category', () => {
    expect(resolveToolCategory(tool).name).toBe(ToolCategory.PORTS_SCANNER);
  });

  it('returns the requested category', () => {
    expect(resolveToolCategory(tool, 'vulnerabilities').targetTypes).toEqual([
      TargetType.DOMAIN,
    ]);
  });

  it('throws for a category the tool does not declare', () => {
    expect(() => resolveToolCategory(tool, 'screenshot')).toThrow(
      'Tool "nmap" has no category "screenshot" (has: ports_scanner, vulnerabilities)',
    );
  });

  it('throws for a tool without categories', () => {
    expect(() => resolveToolCategory({ name: 'x', categories: [] })).toThrow(
      'declares no category',
    );
  });
});

describe('sameCategories', () => {
  const a = [
    {
      name: ToolCategory.PORTS_SCANNER,
      targetTypes: [TargetType.IP, TargetType.DOMAIN],
    },
  ];

  it('ignores target-type order', () => {
    expect(
      sameCategories(a, [
        {
          name: ToolCategory.PORTS_SCANNER,
          targetTypes: [TargetType.DOMAIN, TargetType.IP],
        },
      ]),
    ).toBe(true);
  });

  it('is sensitive to category order (it decides the default)', () => {
    const b = [{ name: ToolCategory.VULNERABILITIES, targetTypes: [] }, ...a];
    expect(sameCategories(b, [...a, b[0]])).toBe(false);
  });

  it('treats null as empty', () => {
    expect(sameCategories(null, [])).toBe(true);
  });
});
