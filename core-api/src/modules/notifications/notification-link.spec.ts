import { buildNotificationUrl } from './notification-link';

describe('buildNotificationUrl', () => {
  it('maps static types to paths with placeholders filled', () => {
    expect(
      buildNotificationUrl('WORKSPACE_CREATED', {}),
    ).toBe('/settings/workspaces');
    expect(
      buildNotificationUrl('VULNERABILITY_ANALYSIS_COMPLETED', { id: '1' }),
    ).toBe('/vulnerabilities/1?tab=analysis');
    expect(
      buildNotificationUrl('ASSET_NEW_DETECT', { targetId: '9' }),
    ).toBe('/targets/9/inventory?isNew=true');
    expect(
      buildNotificationUrl('NEW_VULNERABILITY_FOUND', { targetId: '9' }),
    ).toBe('/targets/9/vulnerabilities');
    expect(buildNotificationUrl('NEW_URL_FOUND', { targetId: '9' })).toBe(
      '/targets/9/inventory?tab=urls&isNew=true',
    );
  });

  it('resolves the invitation select branches', () => {
    expect(
      buildNotificationUrl('WORKSPACE_INVITATION', {
        action: 'created',
        token: 'abc',
      }),
    ).toBe('/invite/abc');
    expect(
      buildNotificationUrl('WORKSPACE_INVITATION', { action: 'accepted' }),
    ).toBe('/settings/members');
    expect(
      buildNotificationUrl('WORKSPACE_INVITATION', { action: 'declined' }),
    ).toBe('/settings/members');
    expect(buildNotificationUrl('WORKSPACE_INVITATION', {})).toBe(
      '/invite/{token}',
    );
  });

  it('keeps missing placeholders and never throws on hostile input', () => {
    expect(buildNotificationUrl('ASSET_NEW_DETECT', {})).toBe(
      '/targets/{targetId}/inventory?isNew=true',
    );
    expect(
      buildNotificationUrl('WORKSPACE_CREATED', {
        name: "a{b}'c",
      }),
    ).toBe('/settings/workspaces');
    expect(() =>
      buildNotificationUrl('UNKNOWN_TYPE' as never, {}),
    ).not.toThrow();
  });
});
