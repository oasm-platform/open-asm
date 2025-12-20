import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetManyJobsRequestDto extends GetManyBaseQueryParams {
  @ApiProperty()
  @IsUUID()
  jobHistoryId?: string;
}
