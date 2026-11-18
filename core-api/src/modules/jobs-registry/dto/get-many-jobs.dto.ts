import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { JobStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class GetManyJobsRequestDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  jobHistoryId?: string;

  @ApiProperty({
    required: false,
    enum: [...Object.values(JobStatus), 'all'],
    description: 'Filter by job status; "all" disables the filter',
  })
  @IsIn([...Object.values(JobStatus), 'all'])
  @IsOptional()
  jobStatus?: string;
}
