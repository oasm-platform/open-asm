import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({
    description: 'List of user IDs to receive the notification',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  recipients: string[];

  @ApiProperty({
    description: 'Type of the notification',
    enum: NotificationScope,
    example: NotificationScope.USER,
  })
  @IsEnum(NotificationScope)
  scope: NotificationScope;

  @ApiProperty({
    description: 'Type of the notification',
    enum: NotificationType,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({
    description:
      'Metadata for the notification content (variables for translation)',
    example: { name: 'John Doe' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
