import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetManyBaseResponseDto<T> {
  @ApiProperty({ isArray: true, type: () => Object })
  @IsArray()
  data: T[];
  @ApiProperty({ type: Number })
  total: number;
  @ApiProperty({ type: Number })
  page: number;
  @ApiProperty({ type: Number })
  limit: number;
  @ApiProperty({ type: Boolean })
  hasNextPage?: boolean;
  @ApiProperty({ type: Number })
  pageCount: number;
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class GetManyBaseQueryParams {
  @IsOptional()
  @ApiProperty({ required: false, example: 1 })
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, example: 10 })
  @Min(1)
  @Max(100)
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @IsOptional()
  limit: number = 10;

  @ApiProperty({ required: false, example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy: string = 'createdAt';

  @ApiProperty({ required: false, example: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;
}
