import { IntegrationType } from '@/common/enums/enum';
import { severityProperties } from './severity.schema';
import { TelegramConnector } from '../connectors/telegram.connector';
import { registerConnector } from '../connectors/connector.registry';

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
    chats: {
      type: 'array',
      title: 'Chat Destinations',
      description:
        'List of Telegram chat IDs. Optionally append |topicId for forum topics (e.g., -1001234567890 or -1001234567890|18951).',
      items: {
        type: 'string',
        title: 'Chat ID',
        description:
          'Telegram chat, group, or channel ID — optionally with |topicId for forum supergroups',
        'ui:placeholder': '-1001234567890 or -1001234567890|18951',
      },
      minItems: 1,
    },
    ...severityProperties,
  },
  required: ['app_type', 'category', 'botToken', 'chats'],
  additionalProperties: false,
} as const;
