import {
  PresignUploadRequestDto,
  PresignUploadResponseDto,
} from '@/modules/storage/dto/presign-storage.dto';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

export class LogoPresignRequestDto extends OmitType(PresignUploadRequestDto, [
  'bucket',
] as const) {}

export class LogoPresignResponseDto extends OmitType(PresignUploadResponseDto, [
  'contentType',
] as const) {}

export class ConfirmLogoRequestDto {
  @ApiProperty({
    example: 'logo-1a2b3c.png',
    description: 'Object key returned by the logo presign endpoint',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}
