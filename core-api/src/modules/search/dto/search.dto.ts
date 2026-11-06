import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { Severity } from '@/common/enums/enum';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchAssetsTargetsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: true })
  @IsString()
  value: string;

  @ApiProperty({ required: false, example: 10 })
  @Min(1)
  @Max(10)
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @IsOptional()
  limit: number = 10;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isSaveHistory: boolean;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: Severity,
    description: 'Only return findings with these severities',
  })
  @IsOptional()
  @IsEnum(Severity, { each: true })
  @Transform(
    ({ value }) => (Array.isArray(value) ? value : [value]) as Severity[],
  )
  severity?: Severity[];
}
export class SearchData {
  @ApiProperty({ type: [Asset] })
  assets: Asset[];

  @ApiProperty({ type: [Target] })
  targets: Target[];

  @ApiProperty({
    type: [Vulnerability],
    description: 'Top matching findings, newest first',
  })
  vulnerabilities: Vulnerability[];
}

export class SearchResponseDto {
  @ApiProperty({ type: SearchData })
  data: SearchData;

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  pageCount: number;

  @ApiProperty()
  hasNextPage: boolean;
}

export class GetManySearchHistoryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false, example: 10 })
  @Min(1)
  @Max(10)
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @IsOptional()
  limit: number = 10;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  query: string;
}

export class GetSearchHistoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  query: string;

  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
