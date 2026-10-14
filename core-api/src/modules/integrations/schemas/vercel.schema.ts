import { IntegrationType } from '@/common/enums/enum';
import { VercelConnector } from '../connectors/vercel.connector';
import { registerConnector } from '../connectors/connector.registry';

// Register connector class so the factory can resolve it by appType
registerConnector('vercel', VercelConnector);

/**
 * JSON Schema for Vercel integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const vercelSchema = {
  $id: 'vercel',
  connector: { const: 'vercel' },
  type: 'object',
  title: 'Vercel',
  isAvailable: true,
  icon: '/static/images/integrations/vercel.svg',
  description:
    'Connects to the Vercel API to discover projects and their production domains.',
  properties: {
    app_type: { const: 'vercel', title: 'App Type' },
    category: { const: IntegrationType.CLOUD_PROVIDER, title: 'Category' },
    apiToken: {
      type: 'string',
      title: 'Vercel Access Token',
      description: 'Vercel access token with project read access',
      'ui:widget': 'password',
      'ui:placeholder': 'your-vercel-access-token',
    },
    teamId: {
      type: 'string',
      title: 'Vercel Team ID (optional)',
      'ui:placeholder': 'team_...',
    },
  },
  required: ['app_type', 'category', 'apiToken'],
  additionalProperties: false,
} as const;
