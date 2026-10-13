import { describe, expect, it } from 'vitest';
import { conditionError } from '@/components/filter-builder/filter-model';
import { ASSET_FILTER_FIELDS } from './asset-filter-fields';

describe('ASSET_FILTER_FIELDS validation', () => {
  const err = (field: string, op: string, value: string | string[]) =>
    conditionError({ field, op: op as never, value }, ASSET_FILTER_FIELDS);
  it('mirrors the server operator matrix', () => {
    expect(ASSET_FILTER_FIELDS.map((f) => f.key)).toEqual(
      ['host', 'port', 'ip', 'tech', 'url', 'statusCode', 'tlsHost', 'tag', 'assetGroup']);
    expect(err('port', 'contains', '80')).toBe('Operator not supported');
  });
  it('validates ip, cidr, port and status code values', () => {
    expect(err('ip', 'eq', '1.2.3.4')).toBeNull();
    expect(err('ip', 'eq', '1.2.3')).toMatch(/IP/);
    expect(err('ip', 'inSubnet', ['10.0.0.0/8', '2001:db8::/32'])).toBeNull();
    expect(err('ip', 'inSubnet', ['10.0.0.0/40'])).toMatch(/CIDR/);
    expect(err('port', 'eq', '70000')).toMatch(/port/i);
    expect(err('statusCode', 'eq', '20')).toMatch(/status/i);
  });
});
