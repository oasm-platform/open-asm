import { Reflector } from '@nestjs/core';
import type { PublishEventConfig } from '../event-bridge/publish-event.decorator';
import { PUBLISH_EVENT_KEY } from '../event-bridge/publish-event.decorator';
import { IntegrationsController } from './integrations.controller';
import type { CreateIntegrationDto } from './dto/create-integration.dto';
import type { UpdateIntegrationDto } from './dto/update-integration.dto';

type WiredConfig = { event: { name: string } } & PublishEventConfig;

const reflector = new Reflector();

const wired = (method: (...args: unknown[]) => unknown): WiredConfig => {
  const config = reflector.get<WiredConfig>(PUBLISH_EVENT_KEY, method);
  if (!config) {
    throw new Error('no PUBLISH_EVENT_KEY metadata');
  }
  return config;
};

/** The wire name the decorator was handed, e.g. `integration.connected`. */
const eventName = (method: (...args: unknown[]) => unknown): string =>
  wired(method).event.name;

describe('IntegrationsController audit wiring', () => {
  describe('createIntegration (#30 integration.connected)', () => {
    it('is wired with action integration.connected', () => {
      expect(eventName(IntegrationsController.prototype.createIntegration)).toBe(
        'integration.connected',
      );
    });

    it('records only the app type in changes, never credentials from config', () => {
      const body: CreateIntegrationDto = {
        name: 'Jira',
        appType: 'jira',
        category: 'ticketing',
        config: { host: 'https://x.atlassian.net', apiToken: 's3cr3t-token' },
      };
      const changes = wired(IntegrationsController.prototype.createIntegration).changes?.(body, undefined);
      expect(changes).toEqual({ type: { after: 'jira' } });
      expect(JSON.stringify(changes)).not.toMatch(/apiToken|password|s3cr3t|config/i);
    });

    it('returns no changes when body has no appType', () => {
      const changes = wired(IntegrationsController.prototype.createIntegration).changes?.(undefined, undefined);
      expect(changes).toEqual({});
    });

    it('resolves the resource id from the created integration', () => {
      const resourceId = wired(IntegrationsController.prototype.createIntegration).resourceId?.({ id: 'i-1' });
      expect(resourceId).toBe('i-1');
    });
  });

  describe('deleteIntegration (#31 integration.disconnected)', () => {
    it('is wired with action integration.disconnected', () => {
      expect(eventName(IntegrationsController.prototype.deleteIntegration)).toBe(
        'integration.disconnected',
      );
    });

    it('defines no changes extractor', () => {
      expect(wired(IntegrationsController.prototype.deleteIntegration).changes).toBeUndefined();
    });
  });

  describe('updateIntegration (#32 integration.settings.updated)', () => {
    it('is wired with action integration.settings.updated', () => {
      expect(eventName(IntegrationsController.prototype.updateIntegration)).toBe(
        'integration.settings.updated',
      );
    });

    it('records safe setting fields and strips config secrets', () => {
      const body: UpdateIntegrationDto = {
        name: 'Renamed',
        description: 'desc',
        config: { apiToken: 's3cr3t' },
        syncSchedule: '0 0 * * *',
      };
      const changes = wired(IntegrationsController.prototype.updateIntegration).changes?.(body, undefined);
      expect(changes).toEqual({
        name: { after: 'Renamed' },
        description: { after: 'desc' },
        syncSchedule: { after: '0 0 * * *' },
      });
      expect(JSON.stringify(changes)).not.toMatch(/apiToken|password|s3cr3t|config/i);
    });

    it('records no changes when the body only carries config secrets', () => {
      const body: UpdateIntegrationDto = { config: { apiToken: 's3cr3t', password: 'x' } };
      const changes = wired(IntegrationsController.prototype.updateIntegration).changes?.(body, undefined);
      expect(changes).toEqual({});
      expect(JSON.stringify(changes)).not.toMatch(/apiToken|password|s3cr3t|config/i);
    });

    it('resolves the resource id from the updated integration', () => {
      const resourceId = wired(IntegrationsController.prototype.updateIntegration).resourceId?.({ id: 'i-2' });
      expect(resourceId).toBe('i-2');
    });
  });

  describe('AWS SSO endpoints', () => {
    it('startAwsSsoDevice carries no audit metadata (it connects nothing)', () => {
      const config = reflector.get(
        PUBLISH_EVENT_KEY,
        IntegrationsController.prototype.startAwsSsoDevice,
      );
      expect(config).toBeUndefined();
    });

    it('pollAwsSsoDevice carries no audit metadata (poll repeats, connects nothing)', () => {
      const config = reflector.get(
        PUBLISH_EVENT_KEY,
        IntegrationsController.prototype.pollAwsSsoDevice,
      );
      expect(config).toBeUndefined();
    });

    it('completeAwsSso is the only SSO step wired with integration.connected', () => {
      expect(
        eventName(IntegrationsController.prototype.completeAwsSso),
      ).toBe('integration.connected');
      expect(
        wired(IntegrationsController.prototype.completeAwsSso).resourceId?.({
          id: 'i-3',
        }),
      ).toBe('i-3');
    });
  });
});
