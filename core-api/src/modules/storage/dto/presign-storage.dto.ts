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

  @ApiProperty({ example: 900, description: 'Lifetime of the presigned URL in seconds' })
  expiresIn: number;
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

  @ApiProperty({ example: 900, description: 'Lifetime of the presigned URL in seconds' })
  expiresIn: number;
}
