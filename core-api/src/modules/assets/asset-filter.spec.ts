import { parseFilterParam, validateAssetFilter } from './asset-filter';

const cond = (field: string, op: string, value: unknown) => ({ field, op, value });
const root = (...items: unknown[]) => ({ logic: 'and', items });

describe('validateAssetFilter', () => {
  it.each([
    ['empty root', root()],
    ['host contains', root(cond('host', 'contains', 'api'))],
    ['port in', root(cond('port', 'in', ['80', '443']))],
    ['ip inSubnet v4+v6', root(cond('ip', 'inSubnet', ['10.0.0.0/8', '2001:db8::/32']))],
    ['ip eq', root(cond('ip', 'eq', '1.2.3.4'))],
    ['statusCode neq', root(cond('statusCode', 'neq', '404'))],
    ['assetGroup in', root(cond('assetGroup', 'in', ['3f1c2a8e-6c1b-4d5e-9f00-0a1b2c3d4e5f']))],
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
    ['bad cidr prefix', root(cond('ip', 'inSubnet', ['10.0.0.0/33']))],
    ['cidr without prefix', root(cond('ip', 'inSubnet', ['10.0.0.0']))],
    ['bad port', root(cond('port', 'eq', '70000'))],
    ['bad status code', root(cond('statusCode', 'eq', '20'))],
    ['bad uuid', root(cond('assetGroup', 'eq', 'abc'))],
    ['nested group', root({ logic: 'or', conditions: [{ logic: 'and', conditions: [cond('host', 'eq', 'a')] }] })],
    ['empty group', root({ logic: 'or', conditions: [] })],
    ['51 values', root(cond('host', 'in', Array.from({ length: 51 }, (_, i) => `h${i}`)))],
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
