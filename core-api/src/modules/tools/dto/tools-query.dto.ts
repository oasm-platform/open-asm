import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { WorkerType } from 'src/common/enums/enum';

export class ToolsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ enum: WorkerType, required: false })
  @IsOptional()
  type?: WorkerType;
}
