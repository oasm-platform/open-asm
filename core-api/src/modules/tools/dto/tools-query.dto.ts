import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ToolCategory, WorkerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ToolsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ enum: WorkerType, required: false })
  @IsOptional()
  type?: WorkerType;

  @ApiProperty({ enum: ToolCategory, required: false })
  @IsOptional()
  category?: ToolCategory;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  providerId?: string;
}
