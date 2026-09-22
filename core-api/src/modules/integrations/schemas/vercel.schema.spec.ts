import { IntegrationType } from '@/common/enums/enum';

import { VercelConnector } from '../connectors/vercel.connector';
import { getConnectorClass } from '../connectors/connector.registry';
import {
  maskSensitiveConfigFields,
  validateIntegrationConfig,
} from '../validators/integration.validator';
import { universalIntegrationSchema } from './universal-integration.schema';
import { vercelSchema } from './vercel.schema';

const CATEGORY = IntegrationType.CLOUD_PROVIDER;

function validate(
  config: Record<string, unknown>,
): ReturnType<typeof validateIntegrationConfig> {
  return validateIntegrationConfig({ appType: 'vercel', category: CATEGORY, config });
}

describe('vercelSchema', () => {
  it('registers the VercelConnector for appType "vercel"', () => {
    expect(getConnectorClass('vercel')).toBe(VercelConnector);
  });

  it('accepts a config with only apiToken', () => {
    expect(validate({ apiToken: 'x' })).toEqual({ valid: true, errors: [] });
  });

  it('accepts a config with apiToken and teamId', () => {
    expect(validate({ apiToken: 'x', teamId: 'team_abc123' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects a config missing apiToken and names apiToken', () => {
    const result = validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('apiToken');
  });

  it('rejects an unknown extra property (additionalProperties:false)', () => {
    const result = validate({ apiToken: 'x', bogusField: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('must NOT have additional properties');
  });

  it('masks apiToken preserving the last 4 chars and leaves teamId clear', () => {
    const masked = maskSensitiveConfigFields({
      app_type: 'vercel',
      category: CATEGORY,
      apiToken: 'vercel-access-token-1234',
      teamId: 'team_abc123',
    });

    expect(masked.apiToken).toBe('****1234');
    expect(masked.teamId).toBe('team_abc123');
    expect(masked).not.toHaveProperty('app_type');
    expect(masked).not.toHaveProperty('category');
  });

  it('is the on-disk schema appended to the universal oneOf union', () => {
    const oneOf = universalIntegrationSchema.oneOf as ReadonlyArray<{
      $id?: string;
    }>;
    expect(oneOf).toContain(vercelSchema);
    expect(vercelSchema.$id).toBe('vercel');
    expect(vercelSchema.properties.category.const).toBe(CATEGORY);
    expect(oneOf.map((s) => s.$id)).toContain('vercel');
  });
});
