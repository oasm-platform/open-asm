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
      // no configSchema
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
    ).toThrow(/no.*configSchema/i);
  });
});
