import { NotificationStatus } from '@/common/enums/enum';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { UserContext } from '@/common/decorators/user-context.decorator';
import { Body, Controller, Get, Param, Patch, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { I18nLang } from 'nestjs-i18n';
import { AuthGuard } from '@/common/guards/auth.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @UserContext() user: UserContextPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @I18nLang() lang: string,
  ) {
    return this.notificationsService.getNotifications(user.id, page, limit, lang);
  }

  @Sse('stream')
  stream(@UserContext() user: UserContextPayload) {
    return this.notificationsService.subscribeToStream(user.id);
  }

  @Get('unread-count')
  getUnreadCount(@UserContext() user: UserContextPayload) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch('mark-read')
  markAllAsRead(@UserContext() user: UserContextPayload) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @UserContext() user: UserContextPayload) {
    return this.notificationsService.markAsRead(id, user.id);
  }
}
