import { UserContextPayload } from '@/common/interfaces/app.interface';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { I18nLang } from 'nestjs-i18n';
import { AuthGuard } from '@/common/guards/auth.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UserContext } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { NotificationResponseDto } from './dto/notification.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';

@ApiTags('notifications')
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
  })
  @Get()
  async getNotifications(
    @UserContext() user: UserContextPayload,
    @Query() query: GetManyBaseQueryParams,
    @I18nLang() lang: string,
  ) {
    return this.notificationsService.getNotifications(user.id, query, lang);
  }

  @Doc({
    summary: 'Create a notification',
    description:
      'Create a new notification for a specific user or group of users',
  })
  @Post()
  async createNotification(@Body() body: CreateNotificationDto) {
    return this.notificationsService.createNotification(body);
  }

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
}
