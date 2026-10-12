import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query for `GET /integrations/:id/repositories`. Repositories live in the
 * provider, not our DB, so there is no `total` / sort — only cursor-like
 * page + hasNextPage, which every provider can answer cheaply.
 */
export class ListRepositoriesQueryDto {
  @ApiProperty({ required: false, description: 'Filter by repository name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class SourceRepositoryDto {
  @ApiProperty({ description: 'Provider-side repository id' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: 'acme/web-app' })
  fullName: string;

  @ApiProperty({ example: 'https://github.com/acme/web-app' })
  url: string;

  @ApiProperty({ type: String, nullable: true })
  defaultBranch: string | null;

  @ApiProperty()
  private: boolean;

  @ApiProperty()
  archived: boolean;

  @ApiProperty()
  fork: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  updatedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  pushedAt: string | null;
}

export class SourceOrganizationDto {
  @ApiProperty({
    description: 'Login (GitHub) or full path (GitLab)',
    example: 'acme',
  })
  path: string;

  @ApiProperty({ example: 'Acme Inc.' })
  name: string;

  @ApiProperty({ enum: ['organization', 'user', 'group'] })
  kind: 'organization' | 'user' | 'group';

  @ApiProperty({ example: 'https://github.com/acme' })
  url: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({
    description: 'Value of a GIT_ORG target for this namespace',
    example: 'github.com/acme',
  })
  targetValue: string;
}

export class ListRepositoriesResponseDto {
  @ApiProperty({ type: [SourceRepositoryDto] })
  data: SourceRepositoryDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  hasNextPage: boolean;
}
