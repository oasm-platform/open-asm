import { IntegrationType } from '@/common/enums/enum';
import { severityProperties } from './severity.schema';

/**
 * JSON Schema for Webhook integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const webhookSchema = {
  $id: 'webhook',
  type: 'object',
  title: 'Webhook',
  isAvailable: true,
  description: 'Sends events to a custom webhook endpoint.',
  properties: {
    app_type: { const: 'webhook', title: 'App Type' },
    category: { const: IntegrationType.NOTIFICATION, title: 'Category' },
    url: {
      type: 'string',
      format: 'uri',
      title: 'Webhook URL',
      description: 'Target webhook endpoint URL.',
      'ui:placeholder': 'https://hooks.example.com/webhook',
    },
    ...severityProperties,
  },
  required: ['app_type', 'category', 'url'],
  additionalProperties: false,
} as const;
