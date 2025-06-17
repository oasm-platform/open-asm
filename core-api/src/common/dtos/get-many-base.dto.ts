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

export class GetManyResponseDto<T> {
  @ApiProperty({
    example: [
      {
        id: 1,
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  })
  @IsArray()
  data: T[];
  @ApiProperty()
  total: number;
  @ApiProperty()
  page: number;
  @ApiProperty()
  limit: number;
  @ApiProperty()
  hasNextPage?: boolean;
  @ApiProperty()
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
