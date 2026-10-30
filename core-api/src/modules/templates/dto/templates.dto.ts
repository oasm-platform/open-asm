import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ArtifactDto } from '@/modules/artifacts/dto/artifacts.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
