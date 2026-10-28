import { NotificationStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Keyset pagination over the user's notifications, newest first. No page
 * numbers and no total: both cost a scan of every row the user has, and this
 * table only grows.
 */
export class GetNotificationsQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Opaque keyset cursor; page forward with the nextCursor of the previous response',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => Number(value))
  limit: number = 20;
}

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationStatus })
  status: NotificationStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  message: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ required: false })
  workspaceId?: string;

  @ApiProperty({ required: false })
  ref?: string;

  @ApiProperty({ required: false })
  refId?: string;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: () => [NotificationResponseDto] })
  data: NotificationResponseDto[];

  /** Null on the last page. */
  @ApiProperty({ required: false, nullable: true, type: String })
  nextCursor: string | null;
}
