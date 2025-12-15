import { NotificationType } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class NotificationContentDto {
  @ApiProperty({
    description: 'Translation key for the notification content',
    example: 'notifications.welcome',
  })
  @IsString()
  key: string;

  @ApiPropertyOptional({
    description:
      'Metadata for the notification content (variables for translation)',
    example: { name: 'John Doe' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

export class CreateNotificationDto {
  @ApiProperty({
    description: 'List of user IDs to receive the notification',
    type: [String],
    example: ['user-123', 'user-456'],
  })
  @IsArray()
  @IsString({ each: true })
  recipients: string[];

  @ApiProperty({
    description: 'Type of the notification',
    enum: NotificationType,
    example: NotificationType.USER,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    description: 'Content of the notification including key and metadata',
    type: NotificationContentDto,
  })
  @ValidateNested()
  @Type(() => NotificationContentDto)
  content: NotificationContentDto;
}
