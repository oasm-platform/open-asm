import { describe, expect, it } from 'vitest';
import { splitNotificationUrl } from './notification-url';

describe('splitNotificationUrl', () => {
  it('moves the query of a route into search params', () => {
    expect(splitNotificationUrl('/targets/t-1/inventory?tab=urls')).toEqual({
      to: '/targets/t-1/inventory',
      search: { tab: 'urls' },
    });
  });

  it('leaves a plain path alone', () => {
    expect(splitNotificationUrl('/targets/t-1/vulnerabilities')).toEqual({
      to: '/targets/t-1/vulnerabilities',
    });
  });
});
