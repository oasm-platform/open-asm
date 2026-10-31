import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ArtifactDto } from '@/modules/artifacts/dto/artifacts.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GetTemplatesQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    enum: ['mine', 'shared'],
    required: false,
    default: 'mine',
    description: '`mine`: templates I created. `shared`: public or shared with me.',
  })
  @IsOptional()
  @IsIn(['mine', 'shared'])
  scope: 'mine' | 'shared' = 'mine';
}

export class CreateTemplateDto {
  @ApiProperty({ example: 'my-check.yaml', description: 'Must end in .yaml or .yml' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Nuclei template YAML (max 256 KB)' })
  @IsString()
  content: string;
}

export class SaveTemplateContentDto {
  @ApiProperty({ description: 'Nuclei template YAML (max 256 KB)' })
  @IsString()
  content: string;
}

export class RenameTemplateDto {
  @ApiProperty({ example: 'my-check.yaml', description: 'Must end in .yaml or .yml' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}

export class TemplateContentDto {
  @ApiProperty({ type: () => ArtifactDto })
  artifact: ArtifactDto;

  @ApiProperty()
  content: string;
}

/** At most this many templates per run; the connector downloads each one. */
export const MAX_RUN_TEMPLATES = 100;

export class RunTemplatesDto {
  @ApiProperty({ type: [String], description: `Template IDs to run (max ${MAX_RUN_TEMPLATES})` })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_RUN_TEMPLATES)
  @IsUUID('4', { each: true })
  templateIds: string[];

  @ApiProperty({ type: [String], required: false, description: 'Scan these targets. Set exactly one of targetIds, assetIds, assetGroupIds.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  targetIds?: string[];

  @ApiProperty({ type: [String], required: false, description: 'Scan these assets.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  assetIds?: string[];

  @ApiProperty({ type: [String], required: false, description: 'Scan every asset in these groups.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  assetGroupIds?: string[];
}
