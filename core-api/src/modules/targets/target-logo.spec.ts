import { TargetType } from '@/common/enums/enum';
import { TargetSource } from './entities/target.entity';
import { resolveTargetLogo } from './target-logo';

describe('resolveTargetLogo', () => {
  it('derives the owner avatar for a GitHub organization', () => {
    expect(
      resolveTargetLogo(
        { type: TargetType.GIT_ORG, value: 'github.com/acme', source: TargetSource.GITHUB },
        'https://ignored/favicon.ico',
      ),
    ).toBe('https://github.com/acme.png');
  });

  it('uses the enterprise host for a GitHub Enterprise organization', () => {
    expect(
      resolveTargetLogo(
        { type: TargetType.GIT_ORG, value: 'git.corp.local/platform', source: TargetSource.GITHUB },
        null,
      ),
    ).toBe('https://git.corp.local/platform.png');
  });

  it('returns null for a GitLab group (no derivable avatar)', () => {
    expect(
      resolveTargetLogo(
        { type: TargetType.GIT_ORG, value: 'gitlab.com/acme/team', source: TargetSource.GITLAB },
        null,
      ),
    ).toBeNull();
  });

  it.each([TargetType.DOMAIN, TargetType.IP, TargetType.CIDR])(
    'uses the matching asset favicon for a %s target',
    (type) => {
      expect(
        resolveTargetLogo(
          { type, value: 'example.com', source: TargetSource.MANUAL },
          'https://example.com/favicon.ico',
        ),
      ).toBe('https://example.com/favicon.ico');
    },
  );

  it('returns null for a host target without favicon', () => {
    expect(
      resolveTargetLogo(
        { type: TargetType.DOMAIN, value: 'example.com', source: TargetSource.MANUAL },
        '',
      ),
    ).toBeNull();
  });
});
