import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { Transform } from 'class-transformer';

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
}

export class SearchAssetsTargetsResponseDto {
  @ApiProperty({ isArray: true })
  data: object;

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
}

export class GetSearchHistoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  filter: Record<string, any>;

  @ApiProperty()
  result: object;

  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
