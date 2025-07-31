import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { JobStatus, ToolCategory } from 'src/common/enums/enum';

export class GetNextJobResponseDto {
  @ApiProperty()
  jobId: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  category: ToolCategory;
  @ApiProperty({
    description: 'Command to run',
  })
  command: string;
}

export class WorkerIdParams {
  @ApiProperty()
  @IsUUID()
  workerId: string;
}

export class UpdateResultDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;
  @ApiProperty()
  @IsObject()
  data: {
    error?: boolean;
    raw?: any;
  };
}

export class GetManyJobsQueryParams extends GetManyBaseQueryParams {
  @ApiProperty({
    description: 'Filter jobs by status',
    enum: [...Object.values(JobStatus), 'all'],
    default: 'all',
  })
  @IsIn([...Object.values(JobStatus), 'all'])
  jobStatus: JobStatus | 'all';

  @ApiProperty({
    description: 'Filter jobs by worker name',
    enum: [...Object.values(ToolCategory), 'all'],
    default: 'all',
  })
  @IsIn([...Object.values(ToolCategory), 'all'])
  workerName: ToolCategory | 'all';
}
