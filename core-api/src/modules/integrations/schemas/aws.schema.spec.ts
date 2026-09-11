import { IntegrationType } from '@/common/enums/enum';
import { BadRequestException } from '@nestjs/common';

import { AwsConnector } from '../connectors/aws.connector';
import { getConnectorClass } from '../connectors/connector.registry';
import {
  maskSensitiveConfigFields,
  validateConfigOrThrow,
  validateIntegrationConfig,
} from '../validators/integration.validator';
import { awsSchema } from './aws.schema';

const CATEGORY = IntegrationType.CLOUD_PROVIDER;

function validate(
  config: Record<string, unknown>,
): ReturnType<typeof validateIntegrationConfig> {
  return validateIntegrationConfig({ appType: 'aws', category: CATEGORY, config });
}

describe('awsSchema', () => {
  const validByMethod: Record<string, Record<string, unknown>> = {
    accessKey: {
      connectionMethod: 'accessKey',
      region: 'us-east-1',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret-value-1234',
    },
    assumeRole: {
      connectionMethod: 'assumeRole',
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/role-name',
      externalId: 'external-id-1234',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret-value-1234',
    },
    crossAccountRole: {
      connectionMethod: 'crossAccountRole',
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/role-name',
      externalId: 'external-id-1234',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret-value-1234',
    },
    workloadIdentity: {
      connectionMethod: 'workloadIdentity',
      region: 'us-east-1',
      roleArn: 'arn:aws:iam::123456789012:role/role-name',
      webIdentityToken: 'web-identity-token',
    },
    sso: {
      connectionMethod: 'sso',
      region: 'us-east-1',
      startUrl: 'https://your-org.awsapps.com/start',
      accountId: '123456789012',
      roleName: 'ReadOnlyAccess',
    },
  };

  it('registers the AwsConnector for appType "aws"', () => {
    expect(getConnectorClass('aws')).toBe(AwsConnector);
  });

  it('declares regions default as an empty array', () => {
    expect(awsSchema.properties.regions.default).toEqual([]);
  });

  it.each(Object.entries(validByMethod))(
    'accepts a valid %s config',
    (_method, config) => {
      expect(validate(config)).toEqual({ valid: true, errors: [] });
      expect(() =>
        validateConfigOrThrow({ appType: 'aws', category: CATEGORY, config }),
      ).not.toThrow();
    },
  );

  it.each([
    ['accessKey', { secretAccessKey: 'x' }, 'accessKeyId'],
    [
      'assumeRole',
      { roleArn: 'r', accessKeyId: 'a', secretAccessKey: 's' },
      'externalId',
    ],
    [
      'crossAccountRole',
      { roleArn: 'r', accessKeyId: 'a', secretAccessKey: 's' },
      'externalId',
    ],
    ['workloadIdentity', { roleArn: 'r' }, 'webIdentityToken'],
    ['sso', { startUrl: 'u', accountId: '1' }, 'roleName'],
  ])(
    'rejects %s config missing a required field, naming %s',
    (method, partial, missingField) => {
      const result = validate({
        connectionMethod: method,
        region: 'us-east-1',
        ...partial,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.join('; ')).toContain(missingField);
      expect(() =>
        validateConfigOrThrow({
          appType: 'aws',
          category: CATEGORY,
          config: {
            connectionMethod: method,
            region: 'us-east-1',
            ...partial,
          },
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects an empty config', () => {
    const result = validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a config with only region', () => {
    const result = validate({ region: 'us-east-1' });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('connectionMethod');
  });

  it('accepts SSO config without the hidden clientId/clientSecret/refreshToken', () => {
    expect(validate(validByMethod.sso)).toEqual({ valid: true, errors: [] });
  });

  it('does not require clientId/clientSecret/refreshToken for any method', () => {
    for (const config of Object.values(validByMethod)) {
      expect(validate(config).valid).toBe(true);
    }
  });

  it('accepts clientId/clientSecret/refreshToken on an SSO config', () => {
    const result = validate({
      ...validByMethod.sso,
      clientId: 'sso-client-id',
      clientSecret: 'sso-client-secret-1234',
      refreshToken: 'sso-refresh-token-9876',
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('masks the SSO secret fields and leaves clientId public', () => {
    const masked = maskSensitiveConfigFields({
      app_type: 'aws',
      category: CATEGORY,
      connectionMethod: 'sso',
      region: 'us-east-1',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret-value-1234',
      externalId: 'external-id-1234',
      webIdentityToken: 'web-identity-token',
      clientId: 'sso-client-id',
      clientSecret: 'sso-client-secret-1234',
      refreshToken: 'sso-refresh-token-9876',
    });

    expect(masked.secretAccessKey).toBe('****1234');
    expect(masked.externalId).toBe('****1234');
    expect(masked.clientSecret).toBe('****1234');
    expect(masked.refreshToken).toBe('****9876');
    expect(masked.clientId).toBe('sso-client-id');
    expect(masked).not.toHaveProperty('app_type');
    expect(masked).not.toHaveProperty('category');
  });

  it('does not mark every method field as required at the top level', () => {
    expect(awsSchema.required).toEqual([
      'app_type',
      'category',
      'connectionMethod',
      'region',
    ]);
  });
});
