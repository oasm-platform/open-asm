import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PresignUploadRequestDto {
  @ApiProperty({ example: 'report.pdf', description: 'Original file name of the object' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'default', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bucket?: string;

  @ApiProperty({ example: 'application/pdf', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contentType?: string;
}

export class PresignUploadResponseDto {
  @ApiProperty({ example: 'https://rustfs.internal/default/2024/report.pdf?X-Amz-Signature=...' })
  uploadUrl: string;

  @ApiProperty({ example: '2024/report.pdf' })
  key: string;

  @ApiProperty({ example: '2024/report.pdf' })
  path: string;

  @ApiProperty({ example: 'application/pdf' })
  contentType: string;

  @ApiProperty({ example: 172800, description: 'Lifetime of the presigned URL in seconds' })
  expiresIn: number;
}

export class LogoPresignRequestDto {
  @ApiProperty({ example: 'logo.png', description: 'Original file name of the logo image' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    example: 'image/png',
    required: false,
    description: 'Defaults to the image type derived from the file extension',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contentType?: string;
}

export class LogoPresignResponseDto {
  @ApiProperty({ example: 'https://rustfs.internal/system/logo-1a2b3c.png?X-Amz-Signature=...' })
  uploadUrl: string;

  @ApiProperty({ example: 'logo-1a2b3c.png' })
  key: string;

  @ApiProperty({ example: 'system/logo-1a2b3c.png' })
  path: string;

  @ApiProperty({ example: 172800, description: 'Lifetime of the presigned URL in seconds' })
  expiresIn: number;
}

export class ConfirmLogoRequestDto {
  @ApiProperty({
    example: 'logo-1a2b3c.png',
    description: 'Object key returned by the logo presign endpoint',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}

export class PresignDownloadQueryDto {
  @ApiProperty({ example: 'default' })
  @IsString()
  @IsNotEmpty()
  bucket: string;

  @ApiProperty({ example: '2024/report.pdf' })
  @IsString()
  @IsNotEmpty()
  path: string;

  @ApiProperty({ example: 'report.pdf', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fileName?: string;
}

export class PresignDownloadResponseDto {
  @ApiProperty({ example: 'https://rustfs.internal/default/2024/report.pdf?X-Amz-Signature=...' })
  downloadUrl: string;

  @ApiProperty({ example: 172800, description: 'Lifetime of the presigned URL in seconds' })
  expiresIn: number;
}
