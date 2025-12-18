import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { IssueStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class GetManyIssuesDto extends GetManyBaseQueryParams {
  @ApiProperty({
    description: 'Filter by status',
    enum: IssueStatus,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  @IsEnum(IssueStatus, { each: true })
  status?: IssueStatus[];

  @ApiProperty({
    description: 'Search term for filtering issues',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  declare search?: string;
}
