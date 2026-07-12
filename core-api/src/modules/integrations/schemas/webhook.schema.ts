import { IntegrationType } from '@/common/enums/enum';
import { notificationTypeProperties } from './notification-type.schema';
import { severityProperties } from './severity.schema';
import { WebhookConnector } from '../connectors/webhook.connector';
import { registerConnector } from '../connectors/connector.registry';

// Register connector class so the factory can resolve it by appType
registerConnector('webhook', WebhookConnector);

/**
 * JSON Schema for Webhook integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const webhookSchema = {
  $id: 'webhook',
  connector: WebhookConnector,
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
    ...notificationTypeProperties,
    ...severityProperties,
  },
  required: ['app_type', 'category', 'url'],
  additionalProperties: false,
} as const;
