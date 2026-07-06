import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class CreateFirstAdminDto {
  @ApiProperty()
  @IsEmail()
  email: string;
  @IsString()
  @ApiProperty()
  password: string;
}

export class GetMetadataDto {
  @ApiProperty()
  isInit: boolean;

  @ApiProperty()
  isAssistant: boolean;

  @ApiProperty({ description: 'System name' })
  name: string;

  @ApiProperty({
    description: 'Path to system logo',
    type: String,
    nullable: true,
  })
  logoPath?: string | null;

  @ApiProperty({ description: 'Current system version' })
  currentVersion: string | null;
}

export class GetVersionDto {
  @ApiProperty({
    description: 'Current system version',
    type: String,
    nullable: true,
  })
  currentVersion: string | null;

  @ApiProperty({
    description: 'Latest system version',
    type: String,
    nullable: true,
  })
  latestVersion: string | null;

  @ApiProperty({ description: 'Release date', nullable: true })
  releaseDate?: string;

  @ApiProperty({ description: 'Release notes', nullable: true })
  notes?: string;

  @ApiProperty({ description: 'Is latest version', nullable: true })
  isLatest?: boolean;
}
