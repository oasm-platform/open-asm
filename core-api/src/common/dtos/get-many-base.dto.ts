import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * `sortBy` becomes a bare SQL identifier in `ORDER BY <alias>.<sortBy>` —
 * TypeORM parameterises values, not column names. Every consumer therefore
 * MUST treat it as an identifier: either allow-list it against the entity's
 * columns, or rely on this pattern to guarantee it carries no SQL syntax.
 *
 * A single unquoted identifier is not enough to express an injection payload in
 * Postgres: CASE expressions and subqueries both require parentheses or
 * whitespace, both rejected here.
 */
export const SAFE_SORT_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
  @ApiProperty({ required: false })
  @IsString()
  search?: string = '';

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
  @Matches(SAFE_SORT_IDENTIFIER, {
    message: 'sortBy must be a plain column name',
  })
  sortBy: string = 'createdAt';

  @ApiProperty({ required: false, example: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;
}
