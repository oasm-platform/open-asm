import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { Workspace } from '../entities/workspace.entity';

export class CreateWorkspaceDto extends PickType(Workspace, [
  'name',
  'description',
  'archivedAt',
] as const) {}

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {}

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
