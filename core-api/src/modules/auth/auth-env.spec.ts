import { isLocalEnv } from '@/common/config/runtime-env';
import { resolveAuthSecret } from './auth-env';

const strongSecret = 'f3Jq9vX2mR7tL0pK8sW4nB6yH1cD5eZaU+oQ=';

describe('isLocalEnv', () => {
  it.each(['development', 'test'])('treats %s as local', (NODE_ENV) => {
    expect(isLocalEnv({ NODE_ENV })).toBe(true);
  });

  it.each([['production'], [undefined]])(
    'treats NODE_ENV=%s as deployed',
    (NODE_ENV) => {
      expect(isLocalEnv({ NODE_ENV })).toBe(false);
    },
  );
});

describe('resolveAuthSecret', () => {
  describe('deployed (NODE_ENV unset, as in the Docker image)', () => {
    it('returns a strong secret', () => {
      expect(resolveAuthSecret({ BETTER_AUTH_SECRET: strongSecret })).toBe(
        strongSecret,
      );
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['too short', 'short-secret'],
      [
        "better-auth's public default",
        'better-auth-secret-12345678901234567890',
      ],
    ])('refuses to boot when the secret is %s', (_, BETTER_AUTH_SECRET) => {
      expect(() => resolveAuthSecret({ BETTER_AUTH_SECRET })).toThrow(
        /BETTER_AUTH_SECRET must be a random value of at least 32 characters/,
      );
    });

    it('applies with NODE_ENV=production too', () => {
      expect(() => resolveAuthSecret({ NODE_ENV: 'production' })).toThrow();
    });
  });

  describe('local', () => {
    it('lets better-auth fall back to its default when unset', () => {
      expect(resolveAuthSecret({ NODE_ENV: 'development' })).toBeUndefined();
    });

    it('uses a configured secret as is', () => {
      expect(
        resolveAuthSecret({ NODE_ENV: 'test', BETTER_AUTH_SECRET: 'short' }),
      ).toBe('short');
    });
  });
});
