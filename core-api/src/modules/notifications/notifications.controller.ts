import { UserContextPayload } from '@/common/interfaces/app.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { I18nLang } from 'nestjs-i18n';
import { AuthGuard } from '@/common/guards/auth.guard';
import { getWorkspaceIdFromRequest } from '@/common/decorators/workspace-id.decorator';
import { DeleteNotificationByRefDto } from './dto/delete-notification-by-ref.dto';
import { UserContext } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import type { Request } from 'express';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { NotificationResponseDto } from './dto/notification.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Doc({
    summary: 'Get all notifications',
    description:
      'Retrieve a paginated list of notifications for the current user',
    response: {
      serialization: GetManyResponseDto(NotificationResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  async getNotifications(
    @UserContext() user: UserContextPayload,
    @Req() req: Request,
    @Query() query: GetManyBaseQueryParams,
    @I18nLang() lang: string,
  ) {
    const workspaceId = getWorkspaceIdFromRequest(req);
    return this.notificationsService.getNotifications(
      user.id,
      workspaceId,
      query,
      lang,
    );
  }

  // NOTE: `POST /notifications` (createNotification) was removed.
  // Every real caller of NotificationsService.createNotification is an internal
  // service (workspaces, data-adapter, statistic, vulnerability processor); the
  // HTTP route had no client. Exposing it let any authenticated user create
  // in-app notifications for arbitrary user ids — including administrators —
  // with attacker-controlled interpolation metadata, and the `notification`
  // permission resource has no `write` action to gate it with.

  @Doc({
    summary: 'Subscribe to notifications stream',
    description:
      'Subscribe to a Server-Sent Events (SSE) stream for real-time notifications',
  })
  @Sse('stream')
  stream(@UserContext() user: UserContextPayload) {
    return this.notificationsService.subscribeToStream(user.id);
  }

  @Doc({
    summary: 'Get unread notifications count',
    description:
      'Get the total count of unread notifications for the current user',
  })
  @Get('unread-count')
  getUnreadCount(@UserContext() user: UserContextPayload) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Doc({
    summary: 'Mark all notifications as read',
    description: 'Mark all notifications as read for the current user',
  })
  @Patch('mark-read')
  markAllAsRead(@UserContext() user: UserContextPayload) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Doc({
    summary: 'Mark all notifications as unread',
    description: 'Mark all notifications as unread for the current user',
  })
  @Patch('mark-unread')
  markAllAsUnread(@UserContext() user: UserContextPayload) {
    return this.notificationsService.markAllAsUnread(user.id);
  }

  @Doc({
    summary: 'Mark a specific notification as read',
    description: 'Mark a single notification as read by its ID',
  })
  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @UserContext() user: UserContextPayload) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Doc({
    summary: 'Delete notifications by ref',
    description:
      'Delete the current user\'s notification recipient records matching ' +
      'the given ref/refId (e.g. all notifications about target 1234 once ' +
      'the related work is completed). The notifications themselves are ' +
      'preserved for other recipients.',
  })
  @Delete('by-ref')
  deleteNotificationsByRef(
    @Query() query: DeleteNotificationByRefDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.notificationsService.deleteByRef(
      query.ref,
      query.refId,
      user.id,
    );
  }

  @Doc({
    summary: 'Delete a notification',
    description:
      'Delete a notification recipient record for the current user. The notification itself is preserved for other recipients.',
  })
  @Delete(':id')
  deleteNotification(
    @Param('id') id: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.notificationsService.deleteNotification(id, user.id);
  }
}
