import { GetManyJobsRequestDto } from './get-many-jobs-dto';
import { JobRunType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class GetManyJobHistoriesRequestDto extends GetManyJobsRequestDto {
  @ApiProperty({
    required: false,
    enum: [...Object.values(JobRunType), 'all'],
    description: 'Filter by run type; "all" disables the filter',
  })
  @IsIn([...Object.values(JobRunType), 'all'])
  @IsOptional()
  jobRunType?: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by creation date from (ISO 8601 format, e.g., 2026-01-01)',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by creation date to (ISO 8601 format, e.g., 2026-01-31)',
    example: '2026-01-31',
  })
  @IsDateString()
  @IsOptional()
  createdTo?: string;
}
