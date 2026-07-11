/**
 * JSON Schema for Cloudflare integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const cloudflareSchema = {
  $id: 'cloudflare',
  type: 'object',
  title: 'Cloudflare',
  description: 'Connects to Cloudflare API for DNS and security management.',
  properties: {
    app_type: { const: 'cloudflare', title: 'App Type' },
    category: { const: 'Cloud provider', title: 'Category' },
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
