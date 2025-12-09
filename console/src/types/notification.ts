export const NotificationStatus = {
  SENT: 'sent',
  UNREAD: 'unread',
  READED: 'readed',
} as const;
export type NotificationStatus = typeof NotificationStatus[keyof typeof NotificationStatus];

export const NotificationType = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  GROUP: 'GROUP',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

export interface NotificationContent {
  key: string;
  metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  type: NotificationType;
  content: NotificationContent;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecipient {
  id: string;
  notificationId: string;
  userId: string;
  status: NotificationStatus;
  message?: string;
  notification: Notification;
  createdAt: string;
  updatedAt: string;
}
