import {
  getSensitiveFields,
  isMaskedValue,
  maskProfile,
} from './tool-config-profiles.crypto';

describe('getSensitiveFields', () => {
  it('detects fields explicitly marked with "ui:widget": "password"', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        apiKey: { type: 'string', 'ui:widget': 'password' },
        target: { type: 'string' },
      },
    };
    expect(getSensitiveFields(schema)).toEqual(['apiKey']);
  });

  it('falls back to name heuristics when ui:widget is absent (nessus-style schema)', () => {
    // Reproduces resources/connectors/manifest.json nessus configSchema:
    // accessKey/password/secretKey carry no ui:widget marker, yet must be
    // treated as secrets by name alone.
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        accessKey: { type: 'string' },
        password: { type: 'string' },
        secretKey: { type: 'string' },
        username: { type: 'string' },
        policyId: { type: 'string' },
        templateUuid: { type: 'string' },
        url: { type: 'string', format: 'uri' },
      },
    };
    expect(getSensitiveFields(schema).sort()).toEqual([
      'accessKey',
      'password',
      'secretKey',
    ]);
  });

  it('matches heuristic case-insensitively (token / apiKey / passwd variants)', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        API_KEY: { type: 'string' },
        AuthToken: { type: 'string' },
        clientPasswd: { type: 'string' },
        clientId: { type: 'string' },
        host: { type: 'string' },
      },
    };
    expect(getSensitiveFields(schema).sort()).toEqual([
      'API_KEY',
      'AuthToken',
      'clientPasswd',
    ]);
  });

  it('does not duplicate fields matched by both ui:widget and heuristic', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        token: { type: 'string', 'ui:widget': 'password' },
        username: { type: 'string', 'ui:widget': 'text' },
      },
    };
    expect(getSensitiveFields(schema)).toEqual(['token']);
  });

  it('returns [] for undefined schema or schemas without sensitive fields', () => {
    expect(getSensitiveFields(undefined)).toEqual([]);
    expect(
      getSensitiveFields({
        type: 'object',
        properties: {
          target: { type: 'string' },
          severity: { type: 'array' },
          username: { type: 'string' },
          url: { type: 'string', format: 'uri' },
        },
      }),
    ).toEqual([]);
  });

  it('scans oneOf/anyOf sub-schemas with the heuristic too', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: {
            accessKey: { type: 'string' },
            endpoint: { type: 'string' },
          },
        },
      ],
    };
    expect(getSensitiveFields(schema).sort()).toEqual(['accessKey']);
  });
});

describe('isMaskedValue', () => {
  it('matches a bare **** placeholder', () => {
    expect(isMaskedValue('****')).toBe(true);
  });

  it('matches **** + last4 as produced by maskProfile', () => {
    expect(isMaskedValue('****1234')).toBe(true);
  });

  it('round-trips against maskProfile output', () => {
    expect(isMaskedValue(maskProfile({ apiToken: 'secret1234' }, ['apiToken']).apiToken)).toBe(true);
  });

  it('rejects real plaintext secrets', () => {
    expect(isMaskedValue('PLAINTOKEN-ABCD1234')).toBe(false);
    expect(isMaskedValue('sk-live-abc')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isMaskedValue(undefined)).toBe(false);
    expect(isMaskedValue(null)).toBe(false);
    expect(isMaskedValue(1234)).toBe(false);
    expect(isMaskedValue({})).toBe(false);
  });
});