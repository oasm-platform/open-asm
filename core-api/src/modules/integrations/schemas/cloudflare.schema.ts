import { IntegrationType } from '@/common/enums/enum';
import { CloudflareConnector } from '../connectors/cloudflare.connector';
import { registerConnector } from '../connectors/connector.registry';

// Register connector class so the factory can resolve it by appType
registerConnector('cloudflare', CloudflareConnector);

/**
 * JSON Schema for Cloudflare integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const cloudflareSchema = {
  $id: 'cloudflare',
  connector: { const: 'cloudflare' },
  type: 'object',
  title: 'Cloudflare',
  isAvailable: true,
  description: 'Connects to Cloudflare API for DNS and security management.',
  properties: {
    app_type: { const: 'cloudflare', title: 'App Type' },
    category: { const: IntegrationType.CLOUD_PROVIDER, title: 'Category' },
    apiToken: {
      type: 'string',
      title: 'Cloudflare API Token',
      description:
        'Cloudflare API token with the required permissions (e.g. DNS:Edit, Zone:Read)',
      'ui:widget': 'password',
      'ui:placeholder': 'your-cloudflare-api-token',
    },
  },
  required: ['app_type', 'category', 'apiToken'],
  additionalProperties: false,
} as const;
