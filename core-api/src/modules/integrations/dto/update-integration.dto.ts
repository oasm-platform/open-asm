import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
