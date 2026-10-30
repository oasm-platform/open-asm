import { ApiProperty } from '@nestjs/swagger';

export class GetMetadataDto {
  @ApiProperty()
  isInit: boolean;

  @ApiProperty({ description: 'System name' })
  name: string;

  @ApiProperty({
    description: 'Path to system logo',
    type: String,
    nullable: true,
  })
  logoPath?: string | null;

  @ApiProperty({
    description:
      'Whether public sign-up is open, so the console shows the sign-up button',
  })
  allowSignUp: boolean;

  @ApiProperty({ description: 'Current system version' })
  currentVersion: string | null;

  @ApiProperty({
    description: 'TTL in seconds for storage presigned URLs',
  })
  storagePresignTtlSeconds: number;

  @ApiProperty({ description: 'Source code repository URL' })
  gitRepoUrl: string;

  @ApiProperty({ description: 'Documentation URL' })
  docsUrl: string;

  @ApiProperty({ description: 'Project home page URL' })
  homePageUrl: string;
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
