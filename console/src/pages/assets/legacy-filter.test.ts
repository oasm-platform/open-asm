import { describe, expect, it } from 'vitest';
import { legacyToFilter } from './legacy-filter';

describe('legacyToFilter', () => {
  it('converts dashboard deep links (string or array) into in-conditions', () => {
    expect(legacyToFilter({ tab: 'port', ports: '443', hosts: ['a', 'b'] })).toEqual({
      logic: 'and',
      items: [
        { field: 'host', op: 'in', value: ['a', 'b'] },
        { field: 'port', op: 'in', value: ['443'] },
      ],
    });
  });
  it('splits comma-separated legacy strings like the old toArray did', () => {
    expect(legacyToFilter({ techs: 'nginx,php' })?.items[0]).toEqual({ field: 'tech', op: 'in', value: ['nginx', 'php'] });
  });
  it('maps legacy urls to an in-condition the url field accepts', () => {
    expect(legacyToFilter({ urls: 'https://a/x' })?.items[0]).toEqual({ field: 'url', op: 'in', value: ['https://a/x'] });
  });
  it('turns a notification link ?isNew=true into the New condition', () => {
    // The router parses `true` to a boolean; a hand-written link may keep the string.
    for (const isNew of [true, 'true']) {
      expect(legacyToFilter({ tab: 'urls', isNew })).toEqual({
        logic: 'and',
        items: [{ field: 'isNew', op: 'eq', value: 'true' }],
      });
    }
    expect(legacyToFilter({ isNew: false })).toBeUndefined();
  });
  it('returns undefined without legacy keys', () => {
    expect(legacyToFilter({ tab: 'service' })).toBeUndefined();
  });
  it('stringifies numeric params parsed from the URL', () => {
    expect(legacyToFilter({ ports: 443, statusCodes: [200, 404] })).toEqual({
      logic: 'and',
      items: [
        { field: 'port', op: 'in', value: ['443'] },
        { field: 'statusCode', op: 'in', value: ['200', '404'] },
      ],
    });
  });
});
