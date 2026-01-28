import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GetManyJobsRequestDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  jobHistoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  jobStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
