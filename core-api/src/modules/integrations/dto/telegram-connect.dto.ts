import { ApiProperty } from '@nestjs/swagger';
import { TelegramConnectStatus } from '@/common/enums/enum';

export class TelegramConnectDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false })
  telegramChatId?: string;

  @ApiProperty({ required: false })
  telegramUsername?: string;

  @ApiProperty({ required: false })
  telegramFirstName?: string;

  @ApiProperty({ required: false })
  telegramLastName?: string;

  @ApiProperty()
  connectToken: string;

  @ApiProperty({ required: false })
  tokenExpiredAt?: Date;

  @ApiProperty({ enum: TelegramConnectStatus, default: TelegramConnectStatus.PENDING })
  status: TelegramConnectStatus;

  @ApiProperty({ default: true })
  isActive: boolean;

  @ApiProperty()
  integrationId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ required: false, description: 'Bot username from Telegram API, e.g. "MyAwesomeBot"' })
  botUsername?: string;
}
