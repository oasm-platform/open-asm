import { Test, type TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConnectorRegistryService } from './connector-registry.service';

/**
 * Real-file approach: writes temp manifest fixtures and points path.resolve at
 * them. Avoids fs/promises mock issues with SWC CJS noInterop.
 */

const TEMP_DIR = path.join(os.tmpdir(), 'connector-registry-test-' + process.pid);

const VALID_MANIFEST = {
  generatedAt: '2026-08-24T13:35:57.223Z',
  connectors: [
    {
      name: 'Nuclei',
      slug: 'nuclei',
      version: '3.3.0',
      image: 'ghcr.io/open-asm/connector-nuclei:3.3.0',
      capabilities: ['vulnerabilities'],
      inputsSchema: {
        type: 'object',
        properties: { target: { type: 'string', format: 'uri' } },
        required: ['target'],
      },
      configSchema: {
        type: 'object',
        properties: { templates: { type: 'string' } },
      },
    },
    {
      name: 'wpscan',
      slug: 'wpscan',
      version: '3.8.25',
      image: 'ghcr.io/open-asm/connector-wpscan:3.8.25',
      capabilities: ['vulnerabilities'],
      inputsSchema: { type: 'object', properties: { target: { type: 'string' } } },
    },
  ],
};

beforeAll(async () => {
  await fs.mkdir(path.join(TEMP_DIR, 'resources', 'connectors'), { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
});

describe('ConnectorRegistryService', () => {
  let service: ConnectorRegistryService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Spy on path.resolve to redirect manifest reads to our temp directory.
  function setupResolveSpy(manifestDir: string) {
    jest.spyOn(path, 'resolve').mockImplementation((...args: string[]) => {
      const joined = path.join(...args);
      if (joined.includes('resources') && joined.includes('manifest.json')) {
        return path.join(manifestDir, 'manifest.json');
      }
      return joined;
    });
  }

  async function initService(): Promise<ConnectorRegistryService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConnectorRegistryService],
    }).compile();

    return module.get<ConnectorRegistryService>(ConnectorRegistryService);
  }

  describe('onModuleInit — happy path', () => {
    beforeEach(async () => {
      const manifestDir = path.join(TEMP_DIR, 'resources', 'connectors');
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify(VALID_MANIFEST),
      );
      setupResolveSpy(manifestDir);

      service = await initService();
      await service.onModuleInit();
    });

    it('should load and index connectors by slug', () => {
      const connector = service.getConnector('nuclei');

      expect(connector).not.toBeNull();
      expect(connector!.slug).toBe('nuclei');
      expect(connector!.name).toBe('Nuclei');
      expect(connector!.image).toBe('ghcr.io/open-asm/connector-nuclei:3.3.0');
      expect(connector!.configSchema).toEqual({
        type: 'object',
        properties: { templates: { type: 'string' } },
      });
    });

    it('should return a connector without configSchema when absent', () => {
      const connector = service.getConnector('wpscan');

      expect(connector).not.toBeNull();
      expect(connector!.slug).toBe('wpscan');
      expect(connector!.configSchema).toBeUndefined();
    });

    it('should return null for an unknown slug', () => {
      expect(service.getConnector('nonexistent')).toBeNull();
    });

    // ── getConnectorSchema ───────────────────────────────────────────
    describe('getConnectorSchema', () => {
      it('should return configSchema when present (nuclei has both)', () => {
        const schema = service.getConnectorSchema('nuclei');
        expect(schema).toEqual({
          type: 'object',
          properties: { templates: { type: 'string' } },
        });
      });

      it('should fall back to inputsSchema when configSchema is absent (wpscan)', () => {
        const schema = service.getConnectorSchema('wpscan');
        expect(schema).toEqual({
          type: 'object',
          properties: { target: { type: 'string' } },
        });
      });

      it('should return null for an unknown slug', () => {
        expect(service.getConnectorSchema('nonexistent')).toBeNull();
      });
    });

    // ── getEffectiveSchema ───────────────────────────────────────────
    describe('getEffectiveSchema', () => {
      it('should return configSchema with source "configSchema" when present', () => {
        const result = service.getEffectiveSchema('nuclei');
        expect(result).toEqual({
          schema: {
            type: 'object',
            properties: { templates: { type: 'string' } },
          },
          source: 'configSchema',
        });
      });

      it('should return inputsSchema with source "inputsSchema" when configSchema absent', () => {
        const result = service.getEffectiveSchema('wpscan');
        expect(result).toEqual({
          schema: {
            type: 'object',
            properties: { target: { type: 'string' } },
          },
          source: 'inputsSchema',
        });
      });

      it('should return null schema with null source for unknown slug', () => {
        const result = service.getEffectiveSchema('nonexistent');
        expect(result).toEqual({ schema: null, source: null });
      });
    });
  });

  describe('getResourceDefaults', () => {
    const MANIFEST_WITH_DEFAULTS = {
      generatedAt: '2026-09-01T00:00:00.000Z',
      connectors: [
        {
          name: 'Nuclei',
          slug: 'nuclei',
          version: '1',
          image: 'img',
          capabilities: [],
          resourceDefaults: { cpu: '1000m', memory: '1Gi', timeoutSeconds: 1200 },
        },
        {
          name: 'Bad',
          slug: 'bad',
          version: '1',
          image: 'img',
          capabilities: [],
          resourceDefaults: { cpu: 'nope', memory: '9999Zz', timeoutSeconds: -5 },
        },
      ],
    };

    it('should return manifest resource defaults when present', async () => {
      const manifestDir = path.join(TEMP_DIR, 'rd-present');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify(MANIFEST_WITH_DEFAULTS),
      );
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await svc.onModuleInit();

      expect(svc.getResourceDefaults('nuclei')).toEqual({
        cpu: '1000m',
        memory: '1Gi',
        timeoutSeconds: 1200,
      });
    });

    it('should fall back to defaults when manifest omits resourceDefaults', async () => {
      const manifestDir = path.join(TEMP_DIR, 'rd-absent');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify(VALID_MANIFEST),
      );
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await svc.onModuleInit();

      expect(svc.getResourceDefaults('nuclei')).toEqual({
        cpu: '500m',
        memory: '512Mi',
        timeoutSeconds: 600,
      });
    });

    it('should fall back to defaults for an unknown slug', async () => {
      const manifestDir = path.join(TEMP_DIR, 'rd-unknown');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify(VALID_MANIFEST),
      );
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await svc.onModuleInit();

      expect(svc.getResourceDefaults('nonexistent')).toEqual({
        cpu: '500m',
        memory: '512Mi',
        timeoutSeconds: 600,
      });
    });

    it('should ignore invalid resourceDefaults values', async () => {
      const manifestDir = path.join(TEMP_DIR, 'rd-invalid');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify(MANIFEST_WITH_DEFAULTS),
      );
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await svc.onModuleInit();

      expect(svc.getResourceDefaults('bad')).toEqual({
        cpu: '500m',
        memory: '512Mi',
        timeoutSeconds: 600,
      });
    });
  });

  describe('onModuleInit — graceful degradation', () => {
    it('should warn and leave registry empty when manifest is missing', async () => {
      const emptyDir = path.join(TEMP_DIR, 'empty-connectors');
      await fs.mkdir(emptyDir, { recursive: true });
      setupResolveSpy(emptyDir);

      const svc = await initService();
      // Should NOT throw — just warn
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      // Registry should be empty
      expect(svc.getConnector('anything')).toBeNull();
    });

    it('should warn and leave registry empty when manifest contains invalid JSON', async () => {
      const manifestDir = path.join(TEMP_DIR, 'invalid-json');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(path.join(manifestDir, 'manifest.json'), '{ not valid json');
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(svc.getConnector('anything')).toBeNull();
    });

    it('should warn and leave registry empty when connectors array is empty', async () => {
      const manifestDir = path.join(TEMP_DIR, 'empty-connectors-arr');
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        path.join(manifestDir, 'manifest.json'),
        JSON.stringify({ generatedAt: '2026-01-01', connectors: [] }),
      );
      setupResolveSpy(manifestDir);

      const svc = await initService();
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(svc.getConnector('anything')).toBeNull();
    });
  });
});
