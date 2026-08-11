import { IsCronSchedule } from '@/modules/asset-group/dto/cron-schedule.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateIntegrationDto {
  @ApiProperty({ required: false, description: 'Human-readable name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false, description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    required: false,
    description: 'App-specific configuration validated via JSON Schema',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      'Cron schedule for periodic asset sync (5-field cron or "disabled")',
    example: 'disabled',
  })
  // Unlike @IsOptional() (which also skips null), null must be rejected: an
  // explicit null would otherwise reach applySchedule and corrupt the
  // scheduler. Only true omission (undefined) is allowed.
  @ValidateIf((o: { syncSchedule?: string | null }) => o.syncSchedule !== undefined)
  @IsString()
  @IsCronSchedule()
  syncSchedule?: string;
}
