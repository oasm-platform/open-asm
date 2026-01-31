import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Response DTO for system configuration
 */
export class SystemConfigResponseDto {
  @ApiProperty({ description: 'System name' })
  name: string;

  @ApiProperty({ description: 'Path to system logo', nullable: true })
  logoPath?: string | null;
}

/**
 * DTO for updating system configuration
 */
export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ description: 'System name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Path to system logo' })
  @IsOptional()
  @IsString()
  logoPath?: string | null;
}
