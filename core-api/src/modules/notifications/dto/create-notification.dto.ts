import { NotificationScope, NotificationType } from '@/common/enums/enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
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
  // Same bulk ceiling the asset-group batch DTOs use — bounds the fan-out so a
  // single call cannot enqueue a notification for an unbounded user list.
  @ArrayMaxSize(1000)
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

  @ApiPropertyOptional({
    description:
      'Name of the feature this notification belongs to (e.g. "target"), ' +
      'used with refId to delete related notifications once the work is done',
    example: 'target',
  })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({
    description: 'Identifier of the related feature record (e.g. "1234")',
    example: '1234',
  })
  @IsOptional()
  @IsString()
  refId?: string;

  workspaceId?: string;
}
