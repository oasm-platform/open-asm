import {
  compileAssetFilter,
  legacyParamsToFilter,
  parseFilterParam,
  validateAssetFilter,
} from './asset-filter';

const cond = (field: string, op: string, value: unknown) => ({ field, op, value });
const root = (...items: unknown[]) => ({ logic: 'and', items });

describe('validateAssetFilter', () => {
  it.each([
    ['empty root', root()],
    ['host contains', root(cond('host', 'contains', 'api'))],
    ['port in', root(cond('port', 'in', ['80', '443']))],
    ['url in', root(cond('url', 'in', ['https://a/x']))],
    ['url notIn', root(cond('url', 'notIn', ['https://a/x']))],
    ['ip inSubnet with host bits', root(cond('ip', 'inSubnet', ['10.1.2.3/24']))],
    ['ip inSubnet v4+v6', root(cond('ip', 'inSubnet', ['10.0.0.0/8', '2001:db8::/32']))],
    ['ip eq', root(cond('ip', 'eq', '1.2.3.4'))],
    ['statusCode neq', root(cond('statusCode', 'neq', '404'))],
    ['assetGroup in', root(cond('assetGroup', 'in', ['3f1c2a8e-6c1b-4d5e-9f00-0a1b2c3d4e5f']))],
    ['isNew true', root(cond('isNew', 'eq', 'true'))],
    ['isNew false', root(cond('isNew', 'eq', 'false'))],
    ['or group', root(cond('host', 'eq', 'a'), { logic: 'or', conditions: [cond('tech', 'eq', 'nginx'), cond('tag', 'contains', 'prod')] })],
  ])('accepts %s', (_, input) => {
    expect(validateAssetFilter(input)).toBeNull();
  });

  it.each([
    ['not an object', 'host=a'],
    ['bad root logic', { logic: 'xor', items: [] }],
    ['unknown field', root(cond('password', 'eq', 'x'))],
    ['op not allowed for field', root(cond('port', 'contains', '80'))],
    ['inSubnet on host', root(cond('host', 'inSubnet', ['10.0.0.0/8']))],
    ['scalar op with array', root(cond('host', 'eq', ['a']))],
    ['list op with scalar', root(cond('host', 'in', 'a'))],
    ['empty list', root(cond('host', 'in', []))],
    ['empty string', root(cond('host', 'eq', ''))],
    ['too long string', root(cond('host', 'eq', 'a'.repeat(256)))],
    ['bad ip', root(cond('ip', 'eq', '999.1.1.1'))],
    ['isNew not a boolean', root(cond('isNew', 'eq', 'yes'))],
    ['isNew with a list op', root(cond('isNew', 'in', ['true']))],
    ['bad cidr prefix', root(cond('ip', 'inSubnet', ['10.0.0.0/33']))],
    ['cidr without prefix', root(cond('ip', 'inSubnet', ['10.0.0.0']))],
    ['ipv6 zone id', root(cond('ip', 'eq', 'fe80::1%eth0'))],
    ['ipv6 zone id in cidr', root(cond('ip', 'inSubnet', ['fe80::1%eth0/64']))],
    ['bad port', root(cond('port', 'eq', '70000'))],
    ['bad status code', root(cond('statusCode', 'eq', '20'))],
    ['bad uuid', root(cond('assetGroup', 'eq', 'abc'))],
    ['nested group', root({ logic: 'or', conditions: [{ logic: 'and', conditions: [cond('host', 'eq', 'a')] }] })],
    ['empty group', root({ logic: 'or', conditions: [] })],
    ['51 values', root(cond('host', 'in', Array.from({ length: 51 }, (_, i) => `h${i}`)))],
    ['prototype key constructor', root(cond('constructor', 'eq', 'x'))],
    ['prototype key toString', root(cond('toString', 'eq', 'x'))],
    ['prototype key __proto__', root(cond('__proto__', 'eq', 'x'))],
    ['NUL in value', root(cond('host', 'eq', 'a\u0000b'))],
    ['21 conditions', root(...Array.from({ length: 21 }, () => cond('host', 'eq', 'a')))],
  ])('rejects %s', (_, input) => {
    expect(validateAssetFilter(input)).toEqual(expect.any(String));
  });

  it('names the failing path', () => {
    expect(validateAssetFilter(root(cond('host', 'eq', 'a'), cond('port', 'eq', 'x')))).toContain('items[1]');
  });
});

describe('parseFilterParam', () => {
  it('parses JSON strings', () => {
    expect(parseFilterParam('{"logic":"and","items":[]}')).toEqual({ logic: 'and', items: [] });
  });
  it('returns non-JSON input unchanged so the validator rejects it', () => {
    expect(parseFilterParam('{bad')).toBe('{bad');
  });
  it('passes undefined through', () => {
    expect(parseFilterParam(undefined)).toBeUndefined();
  });
});

describe('compileAssetFilter', () => {
  const compile = (...items: unknown[]) =>
    compileAssetFilter({ logic: 'and', items } as never, 'af');

  it('returns null for an empty filter', () => {
    expect(compile()).toBeNull();
  });

  it('eq binds a single-element array to = ANY', () => {
    expect(compile(cond('host', 'eq', 'a.com'))).toEqual({
      sql: '((asset.value = ANY(:af0)))',
      params: { af0: ['a.com'] },
    });
  });

  it('notIn negates the match', () => {
    const r = compile(cond('port', 'notIn', ['80', '443']));
    expect(r?.sql).toBe('(NOT (asset_service.port = ANY(:af0)))');
    expect(r?.params).toEqual({ af0: ['80', '443'] });
  });

  it('contains escapes LIKE metacharacters', () => {
    const r = compile(cond('host', 'contains', '50%_off\\x'));
    expect(r?.sql).toBe('((asset.value ILIKE :af0))');
    expect(r?.params).toEqual({ af0: '%50\\%\\_off\\\\x%' });
  });

  it('inSubnet uses the inet containment operator', () => {
    const r = compile(cond('ip', 'inSubnet', ['10.0.0.0/8']));
    expect(r?.sql).toContain('io."ip" <<= ANY(CAST(:af0 AS inet[]))');
  });

  it('tag and assetGroup use their join tables', () => {
    expect(compile(cond('tag', 'eq', 'prod'))?.sql).toContain('FROM asset_services_tags ast');
    expect(compile(cond('assetGroup', 'eq', 'x'))?.sql).toContain('FROM assets_group_assets aga');
  });

  it('combines a root AND with an OR group and numbers params uniquely', () => {
    const r = compile(
      cond('host', 'eq', 'a'),
      { logic: 'or', conditions: [cond('statusCode', 'eq', '200'), cond('url', 'notContains', 'admin')] },
    );
    expect(r?.sql).toMatch(/^\(\(asset\.value = ANY\(:af0\)\) AND \(\(.*:af1.*\) OR NOT \(.*:af2.*\)\)\)$/);
    expect(Object.keys(r?.params ?? {})).toEqual(['af0', 'af1', 'af2']);
  });

  it('judges isNew on the row each list is about', () => {
    const isNew = { logic: 'and', items: [cond('isNew', 'eq', 'true')] } as never;
    expect(compileAssetFilter(isNew, 'af')?.sql).toContain('run.id = asset_service."jobHistoryId"');
    expect(compileAssetFilter(isNew, 'af', 'asset')?.sql).toContain('run.id = asset."jobHistoryId"');
    expect(compileAssetFilter(isNew, 'af', 'url')?.sql).toContain('run.id = du."jobHistoryId"');
    // true keeps the fresh rows, false the others.
    expect(compileAssetFilter(isNew, 'af')?.sql).toContain("= ('true' = ANY(:af0))");
  });

  it('never puts values into the SQL text', () => {
    const r = compile(cond('host', 'eq', "x' OR 1=1 --"));
    expect(r?.sql).not.toContain('1=1');
  });
});

describe('legacyParamsToFilter', () => {
  it('returns undefined when no legacy params are set', () => {
    expect(legacyParamsToFilter({})).toBeUndefined();
  });
  it('maps each array param to an in condition', () => {
    expect(legacyParamsToFilter({ hosts: ['a'], ports: ['80'], tlsHosts: [] })).toEqual({
      logic: 'and',
      items: [cond('host', 'in', ['a']), cond('port', 'in', ['80'])],
    });
  });
  it('maps isNew=true to the condition the filter builder writes', () => {
    expect(legacyParamsToFilter({ isNew: true })).toEqual({
      logic: 'and',
      items: [cond('isNew', 'eq', 'true')],
    });
    expect(legacyParamsToFilter({ isNew: false })).toBeUndefined();
  });
});
