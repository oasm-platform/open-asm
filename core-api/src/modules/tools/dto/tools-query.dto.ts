import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ToolCategory, WorkerType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

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
  providerId?: string;

  @ApiProperty({
    required: false,
    description:
      'true → only AI agent tools (built-in tools always count), false → only the others',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  agentTool?: boolean;
}
