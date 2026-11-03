import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import {
  ProjectAssetSource,
  ProjectScopeRuleType,
  TargetType,
} from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ProjectAssetIdsDto {
  @ApiProperty({
    description: 'Asset IDs',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(1000)
  assetIds: string[];
}

export class GetProjectAssetsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    enum: ProjectAssetSource,
    enumName: 'ProjectAssetSource',
  })
  @IsOptional()
  @IsEnum(ProjectAssetSource)
  source?: ProjectAssetSource;
}

export class SeverityCountsDto {
  @ApiProperty() critical: number;
  @ApiProperty() high: number;
  @ApiProperty() medium: number;
  @ApiProperty() low: number;
  @ApiProperty() info: number;
}

export class ProjectAssetRuleDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ProjectScopeRuleType, enumName: 'ProjectScopeRuleType' })
  type: ProjectScopeRuleType;
  @ApiProperty() value: string;
  @ApiProperty() label: string;
}

export class ProjectAssetScanDto {
  @ApiProperty() runId: string;
  @ApiProperty() createdAt: Date;
}

export class ProjectAssetDto {
  @ApiProperty() id: string;
  @ApiProperty() value: string;
  @ApiProperty() targetId: string;
  @ApiProperty() targetValue: string;
  @ApiProperty({ enum: TargetType, enumName: 'TargetType' })
  targetType: TargetType;
  @ApiProperty({ enum: ProjectAssetSource, enumName: 'ProjectAssetSource' })
  source: ProjectAssetSource;
  @ApiProperty({ type: () => ProjectAssetRuleDto, required: false, nullable: true })
  rule: ProjectAssetRuleDto | null;
  @ApiProperty({ description: 'When the asset joined the project' })
  addedAt: Date;
  @ApiProperty({ type: () => SeverityCountsDto, description: 'Open vulnerabilities the project found' })
  vulnerabilities: SeverityCountsDto;
  @ApiProperty({ type: () => ProjectAssetScanDto, required: false, nullable: true })
  lastScan: ProjectAssetScanDto | null;
}
