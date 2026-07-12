import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Request body for testing an integration.
 * The test sends a sample payload matching the integration's category.
 */
export class TestIntegrationDto {
  @ApiProperty({
    description:
      'Optional custom test message text. Defaults to a standard test message per category.',
    required: false,
  })
  @IsOptional()
  @IsString()
  text?: string;
}
