import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({ description: 'Profile name (unique per tool)', example: 'production' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  name: string;

  @ApiProperty({ description: 'Tool-specific configuration object', example: { severity: ['high'] } })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({ description: 'Set as default profile', required: false, default: false })
  @IsOptional()
  isDefault?: boolean;
}
