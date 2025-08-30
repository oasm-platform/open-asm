import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { ToolCategory, WorkerType } from 'src/common/enums/enum';

export class ToolsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ enum: WorkerType, required: false })
  @IsOptional()
  type?: WorkerType;

  @ApiProperty({ enum: ToolCategory, required: false })
  @IsOptional()
  category?: ToolCategory;

  @ApiProperty({ required: false })
  @IsUUID()
  workspaceId: string;
}
