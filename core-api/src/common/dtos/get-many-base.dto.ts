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
  // SECURITY: `sortBy` is interpolated straight into `.orderBy('<alias>.' +
  // sortBy)`, which TypeORM does NOT parameterize. Accepting free-form text
  // here made every consumer a SQL-injection sink (verified: values reached
  // Postgres and arbitrary subqueries executed). Restrict the shape to a
  // dotted identifier path so only real column names can pass; services that
  // care about a stricter set additionally enforce their own allow-list
  // (e.g. ALLOWED_WORKFLOW_SORT_FIELDS, JOB_SORTABLE_COLUMNS).
  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/, {
    message:
      'sortBy must be a column name (letters, digits, underscore; optional dotted relation path)',
  })
  sortBy: string = 'createdAt';

  @ApiProperty({ required: false, example: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;
}
