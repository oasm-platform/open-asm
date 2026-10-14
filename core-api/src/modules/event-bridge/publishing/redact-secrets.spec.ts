import { REDACTED, redactSecrets } from './redact-secrets';

/**
 * The rules are the security boundary for everything that leaves the process:
 * a published event lands in Redis and is forwarded to customer webhooks, so
 * a secret that survives redaction is a secret in someone else's infrastructure.
 *
 * Two independent rules are tested deliberately, because they fail differently:
 * a KEY-NAME rule catches `apiToken: 'short'` but not `value: 'ghp_...'`, and
 * the VALUE rule catches the second but not `password: 'hunter2'`. Removing
 * either one leaves a real leak, which is why both have their own cases.
 */
describe('redactSecrets', () => {
  describe('key names', () => {
    it.each([
      'password',
      'apiKey',
      'api_key',
      'API-KEY',
      'secret',
      'token',
      'accessToken',
      'authorization',
      'bearer',
      'privateKey',
      'credential',
      'clientSecret',
      'passphrase',
      'sshKey',
    ])('drops %s even when the value is harmless', (key) => {
      expect(redactSecrets({ [key]: 'hunter2' })).toEqual({});
    });

    it('keeps a non-secret field', () => {
      expect(redactSecrets({ name: 'Web Servers', count: 3 })).toEqual({
        name: 'Web Servers',
        count: 3,
      });
    });
  });

  describe('values', () => {
    // An innocuous key is exactly the mistake this rule exists for: someone
    // pastes a token into a field called `value`.
    it('masks an OpenAI-style key under an innocuous name', () => {
      expect(redactSecrets({ value: 'sk-live-abcdef123456' })).toEqual({
        value: REDACTED,
      });
    });

    it('masks an AWS access key id under an innocuous name', () => {
      expect(redactSecrets({ value: 'AKIAIOSFODNN7EXAMPLE' })).toEqual({
        value: REDACTED,
      });
    });

    it('masks a PEM block under an innocuous name', () => {
      expect(redactSecrets({ value: '-----BEGIN RSA PRIVATE KEY-----' })).toEqual({
        value: REDACTED,
      });
    });

    it('masks a long delimiter-free token (GitHub PAT)', () => {
      expect(
        redactSecrets({ note: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' }),
      ).toEqual({ note: REDACTED });
    });

    // 36 = UUID length. Masking resource ids would make the audit trail
    // unreadable, since every row has one.
    it('keeps a UUID', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      expect(redactSecrets({ id: uuid })).toEqual({ id: uuid });
    });

    it('keeps an ordinary word and a short code', () => {
      expect(redactSecrets({ target: 'example.com', port: 443 })).toEqual({
        target: 'example.com',
        port: 443,
      });
    });
  });

  describe('nesting', () => {
    it('recurses into nested objects', () => {
      expect(
        redactSecrets({ integration: { name: 'Jira', password: 'x' } }),
      ).toEqual({ integration: { name: 'Jira' } });
    });

    it('recurses into arrays of objects', () => {
      expect(
        redactSecrets({
          members: [{ name: 'a', token: 'x' }, { name: 'b' }],
        }),
      ).toEqual({ members: [{ name: 'a' }, { name: 'b' }] });
    });

    it('recurses through several levels', () => {
      expect(
        redactSecrets({ a: { b: { c: { apiKey: 'x', keep: 1 } } } }),
      ).toEqual({ a: { b: { c: { keep: 1 } } } });
    });

    it('handles a bare array', () => {
      expect(redactSecrets([{ secret: 'x' }, { ok: 1 }])).toEqual([
        {},
        { ok: 1 },
      ]);
    });

    it('leaves non-string scalars alone', () => {
      expect(redactSecrets({ n: 1, b: true, z: null })).toEqual({
        n: 1,
        b: true,
        z: null,
      });
    });
  });

  describe('purity', () => {
    // The producer redacts for transport; the caller's own object must still be
    // intact, or a redacted event would blank the in-memory value the request
    // is about to return.
    it('does not mutate its input', () => {
      const original = { apiKey: 'sk-live-abc', nested: { token: 'x', ok: 1 } };
      redactSecrets(original);

      expect(original.apiKey).toBe('sk-live-abc');
      expect(original.nested.token).toBe('x');
    });
  });
});