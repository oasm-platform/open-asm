import { BadRequestException } from '@nestjs/common';

import { ConnectorRegistryService } from '@/modules/connectors/connector-registry.service';
import { validateProfileOrThrow } from './tool-config-profiles.validator';

describe('validateProfileOrThrow', () => {
  const nucleiSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      severity: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['info', 'low', 'medium', 'high', 'critical'],
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
      excludeTags: { type: 'array', items: { type: 'string' } },
      templateIds: { type: 'array', items: { type: 'string' } },
      rateLimit: { type: 'integer' },
      concurrency: { type: 'integer' },
      followRedirects: { type: 'boolean' },
    },
    additionalProperties: false,
  };

  let mockGetConnector: jest.SpyInstance;

  beforeEach(() => {
    // Stub ConnectorRegistryService.prototype.getConnector via prototype spy
    mockGetConnector = jest
      .spyOn(ConnectorRegistryService.prototype, 'getConnector')
      .mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes valid config against schema', () => {
    mockGetConnector.mockReturnValue({
      name: 'nuclei',
      slug: 'nuclei',
      configSchema: nucleiSchema,
    });

    // Should NOT throw
    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nuclei',
        { severity: ['high', 'critical'], concurrency: 10 },
      ),
    ).not.toThrow();
  });

  it('rejects invalid type (string where integer expected)', () => {
    mockGetConnector.mockReturnValue({
      name: 'nuclei',
      slug: 'nuclei',
      configSchema: nucleiSchema,
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nuclei',
        { rateLimit: 'not-a-number' },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects unknown property (additionalProperties:false)', () => {
    mockGetConnector.mockReturnValue({
      name: 'nuclei',
      slug: 'nuclei',
      configSchema: nucleiSchema,
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nuclei',
        { unknownField: 'value' },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects enum violation (severity value outside list)', () => {
    mockGetConnector.mockReturnValue({
      name: 'nuclei',
      slug: 'nuclei',
      configSchema: nucleiSchema,
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nuclei',
        { severity: ['invalid_severity'] },
      ),
    ).toThrow(BadRequestException);
  });

  it('passes when optional fields are missing (no required fields)', () => {
    mockGetConnector.mockReturnValue({
      name: 'nuclei',
      slug: 'nuclei',
      configSchema: nucleiSchema,
    });

    // Empty config — all fields optional
    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nuclei',
        {},
      ),
    ).not.toThrow();
  });

  it('throws for unknown tool (getConnector returns null)', () => {
    mockGetConnector.mockReturnValue(null);

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nonexistent',
        {},
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'nonexistent',
        {},
      ),
    ).toThrow(/unknown tool/i);
  });

  it('throws for schema-less tool (no configSchema)', () => {
    mockGetConnector.mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
      // no configSchema, no inputsSchema
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'wpscan',
        {},
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'wpscan',
        {},
      ),
    ).toThrow(/no config schema or inputs schema/i);
  });

  it('missing schemas error mentions inputs schema', () => {
    mockGetConnector.mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
      // neither configSchema nor inputsSchema present
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'wpscan',
        {},
      ),
    ).toThrow(
      'Tool "wpscan" has no config schema or inputs schema -- cannot validate config',
    );
  });

  // ── Fallback: configSchema absent → inputsSchema used ─────────────
  it('passes valid config against inputsSchema fallback when configSchema absent', () => {
    mockGetConnector.mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
      // no configSchema — should fall back to inputsSchema
      inputsSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', format: 'uri' },
        },
        required: ['target'],
      },
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'wpscan',
        { target: 'https://example.com' },
      ),
    ).not.toThrow();
  });

  it('rejects invalid config against inputsSchema fallback', () => {
    mockGetConnector.mockReturnValue({
      name: 'wpscan',
      slug: 'wpscan',
      inputsSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', format: 'uri' },
        },
        required: ['target'],
      },
    });

    expect(() =>
      validateProfileOrThrow(
        { getConnector: ConnectorRegistryService.prototype.getConnector } as ConnectorRegistryService,
        'wpscan',
        {},
      ),
    ).toThrow(BadRequestException);
  });
});
