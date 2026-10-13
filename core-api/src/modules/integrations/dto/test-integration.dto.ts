import { IntegrationType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Request body for testing an integration.
 * The test sends a sample payload matching the tested capability.
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

  @ApiProperty({
    required: false,
    enum: IntegrationType,
    enumName: 'IntegrationType',
    description:
      'Capability to test. Defaults to the category for single-capability apps; multi-capability apps test the connection itself when omitted.',
  })
  @IsOptional()
  @IsEnum(IntegrationType)
  capability?: IntegrationType;
}
