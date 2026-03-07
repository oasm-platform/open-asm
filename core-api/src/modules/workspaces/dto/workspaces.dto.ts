import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { Workspace } from '../entities/workspace.entity';

export class CreateWorkspaceDto extends PickType(Workspace, [
  'name',
  'description',
  'archivedAt',
] as const) {}

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {}

/**
 * Response DTO for workspace list items with target and member counts.
 * Used for getWorkspaces API to include targetCount and memberCount.
 */
export class WorkspaceResponseDto {
  @ApiProperty({ description: 'Workspace ID' })
  id: string;

  @ApiProperty({ description: 'Workspace name' })
  name: string;

  @ApiProperty({
    description: 'Workspace description',
    required: false,
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiProperty({
    description: 'Archival timestamp',
    required: false,
    nullable: true,
  })
  archivedAt?: Date | null;

  @ApiProperty({ description: 'Whether asset discovery is enabled' })
  isAssetsDiscovery: boolean;

  @ApiProperty({
    description: 'Whether assets are auto-enabled after discovery',
  })
  isAutoEnableAssetAfterDiscovered: boolean;

  @ApiProperty({ description: 'Owner user ID' })
  ownerId: string;

  @ApiProperty({
    description: 'Number of targets in the workspace',
    example: 10,
  })
  targetCount: number;

  @ApiProperty({
    description: 'Number of members in the workspace',
    example: 5,
  })
  memberCount: number;
}

export class WorkspaceStatisticsResponseDto {
  totalTargets: number;
  totalAssets: number;
  technologies: string[];
  cnameRecords: string[];
  statusCodes: number[];
}

export class GetApiKeyResponseDto {
  @ApiProperty()
  apiKey: string;
}

export class ArchiveWorkspaceDto {
  @ApiProperty({
    example: true,
    description: 'Whether to archive (true) or unarchive (false) the workspace',
  })
  @IsBoolean()
  isArchived: boolean;
}

export class GetManyWorkspacesDto extends GetManyBaseQueryParams {
  @ApiProperty({
    example: true,
    required: false,
    description: 'Whether to archive (true) or unarchive (false) the workspace',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isArchived?: boolean;
}
