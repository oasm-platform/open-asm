import { IntegrationType } from '@/common/enums/enum';
import { notificationTypeProperties } from './notification-type.schema';
import { severityProperties } from './severity.schema';
import { DiscordConnector } from '../connectors/discord.connector';
import { registerConnector } from '../connectors/connector.registry';

// Register connector class so the factory can resolve it by appType
registerConnector('discord', DiscordConnector);

/**
 * JSON Schema for Discord (Alert) integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const discordSchema = {
  $id: 'discord',
  connector: DiscordConnector,
  type: 'object',
  title: 'Discord',
  isAvailable: true,
  description: 'Sends alerts to a Discord channel via webhook.',
  properties: {
    app_type: { const: 'discord', title: 'App Type' },
    category: { const: IntegrationType.NOTIFICATION, title: 'Category' },
    webhookUrl: {
      type: 'string',
      format: 'uri',
      title: 'Webhook URL',
      description:
        'Discord channel webhook URL (Channel settings → Integrations → Webhooks).',
      'ui:placeholder': 'https://discord.com/api/webhooks/000/xxxx',
    },
    username: {
      type: 'string',
      title: 'Bot Username',
      description:
        'Optional display name for the bot sending the alert. Defaults to the webhook name if omitted.',
      'ui:placeholder': 'OpenASM Alert',
    },
    ...notificationTypeProperties,
    ...severityProperties,
  },
  required: ['category', 'webhookUrl'],
  additionalProperties: false,
} as const;
