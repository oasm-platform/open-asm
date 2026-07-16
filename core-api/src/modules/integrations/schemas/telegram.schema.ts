import { IntegrationType } from '@/common/enums/enum';
import { registerConnector } from '../connectors/connector.registry';
import { TelegramConnector } from '../connectors/telegram.connector';
import { notificationTypeProperties } from './notification-type.schema';
import { severityProperties } from './severity.schema';

// Register connector class so the factory can resolve it by appType
registerConnector('telegram', TelegramConnector);

/**
 * JSON Schema for Telegram (Alert) integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const telegramSchema = {
  $id: 'telegram',
  connector: TelegramConnector,
  type: 'object',
  title: 'Telegram',
  isAvailable: true,
  description: 'Sends alerts to a Telegram chat via a bot.',
  properties: {
    app_type: { const: 'telegram', title: 'App Type' },
    category: { const: IntegrationType.NOTIFICATION, title: 'Category' },
    botToken: {
      type: 'string',
      title: 'Bot Token',
      description:
        'Telegram bot token from BotFather, e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      'ui:widget': 'password',
      'ui:placeholder': '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234',
    },
    ...notificationTypeProperties,
    ...severityProperties,
  },
  required: ['app_type', 'category', 'botToken'],
  additionalProperties: false,
} as const;
