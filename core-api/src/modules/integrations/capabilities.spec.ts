import { IntegrationType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';
import {
  getSupportedCapabilities,
  hasCapability,
  isMultiCapabilityApp,
  normalizeCapabilities,
  resolveCapabilities,
} from './capabilities';
import {
  runConnector,
  testConnectorConnection,
} from './connectors/connector.factory';
import { randomBytes } from 'crypto';
import {
  decryptSensitiveConfigFields,
  encryptSensitiveConfigFields,
  maskSensitiveConfigFields,
  restoreMaskedSecrets,
  validateIntegrationConfig,
} from './validators/integration.validator';

describe('integration capabilities', () => {
  describe('schema introspection', () => {
    it('reports legacy apps as their single category', () => {
      expect(isMultiCapabilityApp('telegram')).toBe(false);
      expect(getSupportedCapabilities('telegram')).toEqual([
        IntegrationType.NOTIFICATION,
      ]);
      expect(getSupportedCapabilities('aws')).toEqual([
        IntegrationType.CLOUD_PROVIDER,
      ]);
    });

    it('reports multi-capability apps from x-capabilities', () => {
      for (const appType of ['github', 'gitlab']) {
        expect(isMultiCapabilityApp(appType)).toBe(true);
        expect(getSupportedCapabilities(appType)).toEqual([
          IntegrationType.SOURCE_CODE,
          IntegrationType.TICKETING,
        ]);
      }
    });

    it('reports nothing for an unknown app', () => {
      expect(getSupportedCapabilities('nope')).toEqual([]);
    });
  });

  describe('resolveCapabilities / hasCapability', () => {
    it('falls back to [category] for a row without capabilities', () => {
      const row = { category: IntegrationType.NOTIFICATION, capabilities: [] };
      expect(resolveCapabilities(row)).toEqual([IntegrationType.NOTIFICATION]);
      expect(hasCapability(row, IntegrationType.NOTIFICATION)).toBe(true);
    });

    it('uses the stored array when present', () => {
      const row = {
        category: IntegrationType.SOURCE_CODE,
        capabilities: [IntegrationType.SOURCE_CODE, IntegrationType.TICKETING],
      };
      expect(hasCapability(row, IntegrationType.TICKETING)).toBe(true);
      expect(hasCapability(row, IntegrationType.NOTIFICATION)).toBe(false);
    });
  });

  describe('normalizeCapabilities', () => {
    it('keeps legacy requests that only send category', () => {
      expect(
        normalizeCapabilities({ appType: 'slack', category: 'NOTIFICATION' }),
      ).toEqual({ category: 'NOTIFICATION', capabilities: ['NOTIFICATION'] });
    });

    it('rejects a legacy category that does not match the schema', () => {
      expect(() =>
        normalizeCapabilities({ appType: 'slack', category: 'TICKETING' }),
      ).toThrow(BadRequestException);
    });

    it('dedupes and keeps a still-enabled primary category', () => {
      expect(
        normalizeCapabilities({
          appType: 'github',
          category: 'TICKETING',
          capabilities: ['SOURCE_CODE', 'TICKETING', 'SOURCE_CODE'],
        }),
      ).toEqual({
        category: 'TICKETING',
        capabilities: ['SOURCE_CODE', 'TICKETING'],
      });
    });

    it('moves the primary category when it is no longer enabled', () => {
      expect(
        normalizeCapabilities({
          appType: 'github',
          category: 'TICKETING',
          capabilities: ['SOURCE_CODE'],
        }),
      ).toEqual({ category: 'SOURCE_CODE', capabilities: ['SOURCE_CODE'] });
    });

    it('rejects unknown apps', () => {
      expect(() =>
        normalizeCapabilities({ appType: 'nope', category: 'TICKETING' }),
      ).toThrow(/Unknown integration app/);
    });
  });

  describe('validateIntegrationConfig', () => {
    it('validates legacy schemas exactly as before (no capabilities injected)', () => {
      expect(
        validateIntegrationConfig({
          appType: 'webhook',
          category: 'NOTIFICATION',
          capabilities: ['NOTIFICATION'],
          config: { url: 'https://hooks.example.com/x' },
        }).valid,
      ).toBe(true);
    });

    it('rejects a GitHub config with an unsupported capability', () => {
      const result = validateIntegrationConfig({
        appType: 'github',
        category: 'SOURCE_CODE',
        capabilities: ['SOURCE_CODE', 'NOTIFICATION'],
        config: { apiToken: 'x' },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a malformed GitHub issue repository', () => {
      const result = validateIntegrationConfig({
        appType: 'github',
        category: 'TICKETING',
        capabilities: ['TICKETING'],
        config: { apiToken: 'x', ticketRepository: 'not a repo' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('restoreMaskedSecrets', () => {
    const stored = { apiToken: 'ghp_realtoken1234', baseUrl: 'https://x' };

    it('restores a secret that came back as its own mask', () => {
      expect(
        restoreMaskedSecrets({ apiToken: '****1234', baseUrl: 'https://y' }, stored),
      ).toEqual({ apiToken: 'ghp_realtoken1234', baseUrl: 'https://y' });
    });

    it('keeps a genuinely new secret', () => {
      expect(restoreMaskedSecrets({ apiToken: 'ghp_new' }, stored)).toEqual({
        apiToken: 'ghp_new',
      });
    });
  });

  describe('webhookUrl secrecy', () => {
    const webhookUrl = 'https://hooks.slack.com/services/T00/B00/secretabcd';
    const dek = randomBytes(32);

    it('encrypts at rest, decrypts back and masks in responses', () => {
      const encrypted = encryptSensitiveConfigFields({ webhookUrl }, dek);
      expect(encrypted.webhookUrl).not.toContain('secret');
      expect(decryptSensitiveConfigFields(encrypted, dek)).toEqual({ webhookUrl });
      expect(maskSensitiveConfigFields({ webhookUrl })).toEqual({ webhookUrl: '****abcd' });
    });

    it('still reads a webhookUrl stored as plain text before encryption', () => {
      expect(decryptSensitiveConfigFields({ webhookUrl }, dek)).toEqual({ webhookUrl });
    });

    it('restores a masked webhookUrl so the uri format still validates', () => {
      const config = restoreMaskedSecrets({ webhookUrl: '****abcd' }, { webhookUrl });
      expect(
        validateIntegrationConfig({ appType: 'slack', category: 'NOTIFICATION', config }).valid,
      ).toBe(true);
    });
  });

  describe('connector factory', () => {
    it('reports a capability the connector does not implement', async () => {
      // GitHub has no push(): NOTIFICATION is not one of its capabilities.
      const result = await runConnector('github', 'NOTIFICATION', {});
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/does not implement push\(\)/);
    });

    it('reports a connector without testConnection', async () => {
      const result = await testConnectorConnection('telegram', undefined, {});
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/does not support connection tests/);
    });
  });
});
