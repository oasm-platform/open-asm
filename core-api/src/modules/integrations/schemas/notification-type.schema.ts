import { NotificationType } from '@/common/enums/enum';

/**
 * Group key for `ui:form:group`. Form renderers use this to group related fields
 * into a single section with a grid layout and a shared label.
 */
export const NOTIFICATION_TYPE_GROUP = 'Event' as const;

/**
 * Helper to get the display title for a notification type value.
 * Converts SNAKE_CASE to Title Case.
 */
function notificationTypeTitle(value: NotificationType): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Reusable notification type boolean property definitions.
 *
 * Each notification type is a top-level boolean property so the form renderer
 * can render each as an individual Switch toggle.
 *
 * Usage — spread into any integration schema's `properties`:
 * ```ts
 * import { notificationTypeProperties } from './notification-type.schema';
 *
 * properties: {
 *   // ... other fields
 *   ...notificationTypeProperties,
 * }
 * ```
 */
type NotificationTypeProperty = {
  readonly type: 'boolean';
  readonly title: string;
  readonly default: true;
  readonly 'ui:form:group': 'Event';
};

const ignoredNotificationTypes: NotificationType[] = [
  NotificationType.WORKSPACE_CREATED,
  NotificationType.VULNERABILITY_ANALYSIS_COMPLETED,
];

export const notificationTypeProperties: Record<
  NotificationType,
  NotificationTypeProperty
> = Object.values(NotificationType)
  .filter(
    (type): type is NotificationType =>
      !ignoredNotificationTypes.includes(type),
  )
  .reduce(
    (acc, type) => {
      acc[type] = {
        type: 'boolean' as const,
        title: notificationTypeTitle(type),
        default: true,
        'ui:form:group': NOTIFICATION_TYPE_GROUP,
      };
      return acc;
    },
    {} as Record<NotificationType, NotificationTypeProperty>,
  );
