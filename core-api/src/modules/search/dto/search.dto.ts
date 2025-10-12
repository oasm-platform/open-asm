import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { Asset } from '@/modules/assets/entities/assets.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SearchAssetsTargetsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: true })
  @IsString()
  value: string;

  @ApiProperty()
  @IsUUID(4)
  workspaceId: string;

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
}
export class SearchData {
  @ApiProperty({ type: [Asset] })
  assets: Asset[];

  @ApiProperty({ type: [Target] })
  targets: Target[];
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
  @ApiProperty({ required: true })
  @IsUUID(4)
  workspaceId: string;

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
