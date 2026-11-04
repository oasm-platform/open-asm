import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ScopeRuleInputDto {
  @ApiProperty({ enum: ProjectScopeRuleMode, enumName: 'ProjectScopeRuleMode' })
  @IsEnum(ProjectScopeRuleMode)
  mode: ProjectScopeRuleMode;

  @ApiProperty({ enum: ProjectScopeRuleType, enumName: 'ProjectScopeRuleType' })
  @IsEnum(ProjectScopeRuleType)
  type: ProjectScopeRuleType;

  @ApiProperty({
    description:
      'Target id, hostname pattern (`*` wildcards), CIDR, or asset id',
    example: '*.example.com',
  })
  @IsString()
  @MaxLength(255)
  value: string;
}

export class ReplaceScopeRulesDto {
  @ApiProperty({ type: [ScopeRuleInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScopeRuleInputDto)
  rules: ScopeRuleInputDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoAddAssets?: boolean;
}

export class ScopePreviewDto {
  @ApiProperty({ type: [ScopeRuleInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ScopeRuleInputDto)
  rules: ScopeRuleInputDto[];

  @ApiProperty({
    required: false,
    description: 'Count hand-picked assets of this project as well',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class ScopeRuleDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ProjectScopeRuleMode, enumName: 'ProjectScopeRuleMode' })
  mode: ProjectScopeRuleMode;

  @ApiProperty({ enum: ProjectScopeRuleType, enumName: 'ProjectScopeRuleType' })
  type: ProjectScopeRuleType;

  @ApiProperty()
  value: string;

  /** Target or asset value for id-based rules; the value itself otherwise. */
  @ApiProperty()
  label: string;

  @ApiProperty({ description: 'Assets this rule matches in the workspace' })
  matched: number;
}

export class ProjectScopeDto {
  @ApiProperty({ type: [ScopeRuleDto] })
  rules: ScopeRuleDto[];

  @ApiProperty()
  autoAddAssets: boolean;

  @ApiProperty({ description: 'Assets the rules add' })
  ruleAssets: number;

  @ApiProperty({ description: 'Assets picked by hand' })
  manualAssets: number;
}

export class ScopePreviewResultDto {
  @ApiProperty({ description: 'Assets in scope: rule matches plus hand-picked' })
  total: number;

  @ApiProperty({ description: 'Assets the include/exclude rules select' })
  ruleAssets: number;

  @ApiProperty({
    type: [Number],
    description:
      'Per input rule: assets an include rule matches, or assets an exclude rule removes from the includes',
  })
  perRule: number[];
}

export class ScopeSyncResultDto {
  @ApiProperty()
  added: number;

  @ApiProperty()
  removed: number;
}
