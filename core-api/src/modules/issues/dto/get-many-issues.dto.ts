import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import {
  IssueLinkResourceType,
  IssuePriority,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const toArray = ({ value }: { value: unknown }): unknown =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

/** Columns the issue list can be sorted by. */
export const ISSUE_SORT_FIELDS = [
  'updatedAt',
  'createdAt',
  'dueAt',
  'priority',
  'no',
] as const;
export type IssueSortField = (typeof ISSUE_SORT_FIELDS)[number];

export class GetManyIssuesDto extends GetManyBaseQueryParams {
  @ApiProperty({ enum: IssueStatus, isArray: true, required: false })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(IssueStatus, { each: true })
  status?: IssueStatus[];

  @ApiProperty({ enum: IssueType, isArray: true, required: false })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(IssueType, { each: true })
  type?: IssueType[];

  @ApiProperty({ enum: IssuePriority, isArray: true, required: false })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(IssuePriority, { each: true })
  priority?: IssuePriority[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({ required: false, description: 'Only issues assigned to me' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @ApiProperty({
    required: false,
    description: 'Only open / in-progress issues past their due date',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiProperty({
    enum: IssueLinkResourceType,
    required: false,
    description: 'With resourceId: only issues linked to this resource',
  })
  @IsOptional()
  @IsEnum(IssueLinkResourceType)
  resourceType?: IssueLinkResourceType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiProperty({
    required: false,
    description: 'Search on the title or the issue number (e.g. "#12")',
  })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiProperty({ required: false, enum: ISSUE_SORT_FIELDS, example: 'updatedAt' })
  @IsOptional()
  @IsIn(ISSUE_SORT_FIELDS)
  declare sortBy: string;
}
