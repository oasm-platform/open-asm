import { IsCronSchedule } from '@/modules/asset-group/dto/cron-schedule.validator';
import { IntegrationType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateIntegrationDto {
  @ApiProperty({ example: 'My Jira Integration', description: 'Human-readable name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'jira', description: 'Third-party app identifier' })
  @IsString()
  appType: string;

  @ApiProperty({
    example: 'TICKETING',
    description:
      'Integration category. For multi-capability apps this is the primary capability.',
  })
  @IsString()
  category: string;

  @ApiProperty({
    required: false,
    enum: IntegrationType,
    enumName: 'IntegrationType',
    isArray: true,
    example: [IntegrationType.SOURCE_CODE, IntegrationType.TICKETING],
    description:
      'Capabilities to enable (multi-capability apps such as GitHub). Defaults to [category]; single-capability apps only accept [category].',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(IntegrationType, { each: true })
  capabilities?: IntegrationType[];

  @ApiProperty({
    description: 'App-specific configuration validated via JSON Schema',
    example: {
      host: 'https://your-domain.atlassian.net',
      email: 'user@example.com',
      apiToken: 'your-api-token',
    },
  })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      'Cron schedule for periodic asset sync (5-field cron or "disabled")',
    example: 'disabled',
  })
  @IsOptional()
  @IsCronSchedule()
  syncSchedule?: string;
}
