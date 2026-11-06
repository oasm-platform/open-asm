import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

import { PresignArtifactResponseDto } from '@/modules/artifacts/dto/artifacts.dto';

export class ProjectFileDto {
  @ApiProperty({ description: 'The artifact id of the file' })
  id: string;

  @ApiProperty() name: string;
  @ApiProperty() mimeType: string;
  @ApiProperty() sizeBytes: number;

  @ApiProperty({ type: String, nullable: true })
  createdByName: string | null;

  @ApiProperty({ description: 'When the file was attached to the project' })
  attachedAt: Date;
}

export class PresignProjectFileDto {
  @ApiProperty({ example: 'scope.md', description: '.md, .txt or .csv' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 1024, description: 'Exact file size in bytes (10 MB max)' })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}

export class PresignProjectFileResponseDto extends PresignArtifactResponseDto {}
