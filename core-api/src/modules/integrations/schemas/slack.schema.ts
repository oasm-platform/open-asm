import { IntegrationType } from '@/common/enums/enum';
import { severityProperties } from './severity.schema';
/**
 * JSON Schema for Slack (Alert) integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const slackSchema = {
  $id: 'slack',
  type: 'object',
  title: 'Slack',
  isAvailable: true,
  description: 'Sends alerts to a Slack channel via incoming webhook.',
  properties: {
    app_type: { const: 'slack', title: 'App Type' },
    category: { const: IntegrationType.NOTIFICATION, title: 'Category' },
    webhookUrl: {
      type: 'string',
      format: 'uri',
      title: 'Webhook URL',
      description:
        'Slack incoming webhook URL, e.g. https://hooks.slack.com/services/...',
      'ui:placeholder': 'https://hooks.slack.com/services/T00/B00/xxxx',
    },
    username: {
      type: 'string',
      title: 'Bot Username',
      description:
        'Optional display name for the bot sending the alert. Defaults to the webhook-appointed name if omitted.',
      'ui:placeholder': 'OpenASM Alert',
    },
    ...severityProperties,
  },
  required: ['category', 'webhookUrl'],
  additionalProperties: false,
} as const;
