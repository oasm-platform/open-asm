import { describe, expect, it } from 'vitest';
import { readTemplateMeta } from './template-meta';

describe('readTemplateMeta', () => {
  it('reads id, name, severity, protocol and comma-separated tags', () => {
    const meta = readTemplateMeta(
      'id: x\ninfo:\n  name: X check\n  severity: High\n  tags: php, rce\nhttp:\n  - path: ["/"]\n',
    );
    expect(meta).toEqual({
      id: 'x',
      name: 'X check',
      severity: 'high',
      protocol: 'http',
      tags: ['php', 'rce'],
    });
  });

  it('accepts tags as a list', () => {
    expect(readTemplateMeta('id: x\ninfo:\n  tags: [a, b]\ndns: []\n')).toMatchObject({
      tags: ['a', 'b'],
      protocol: 'dns',
    });
  });

  it('reports the first syntax error with its line', () => {
    const meta = readTemplateMeta('id: x\ninfo:\n  name: [unclosed\n');
    expect(meta.error?.line).toBeGreaterThan(0);
    expect(meta.id).toBeUndefined();
  });

  it('tolerates non-mapping documents', () => {
    expect(readTemplateMeta('- a\n- b\n')).toEqual({
      id: undefined,
      name: undefined,
      severity: undefined,
      protocol: undefined,
      tags: [],
    });
  });
});
