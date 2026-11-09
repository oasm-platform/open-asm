import { describe, expect, it } from 'vitest';
import { targetTabRedirect } from './target-utils';

describe('targetTabRedirect', () => {
  it('leaves current tabs alone', () => {
    expect(targetTabRedirect('overview', undefined)).toBeNull();
    expect(targetTabRedirect('assets', 'urls')).toBeNull();
    expect(targetTabRedirect('vulnerabilities', undefined)).toBeNull();
  });

  it('moves the old vulnerabilities asset tab to its own tab', () => {
    expect(targetTabRedirect('assets', 'vulnerabilities')).toEqual({
      tab: 'vulnerabilities',
      innerTab: undefined,
    });
    expect(targetTabRedirect('inventory', 'vulnerabilities')).toEqual({
      tab: 'vulnerabilities',
      innerTab: undefined,
    });
  });

  it('keeps the asset tab of old inventory links', () => {
    expect(targetTabRedirect('inventory', 'urls')).toEqual({
      tab: 'assets',
      innerTab: 'urls',
    });
    expect(targetTabRedirect('asset-services', undefined)).toEqual({
      tab: 'assets',
      innerTab: undefined,
    });
  });

  it('sends unknown tabs to the overview', () => {
    expect(targetTabRedirect('nope', 'urls')).toEqual({
      tab: 'overview',
      innerTab: undefined,
    });
  });
});
