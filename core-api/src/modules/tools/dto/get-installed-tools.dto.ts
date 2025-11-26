import { ToolCategory } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
export class GetInstalledToolsDto {
  @ApiProperty({
    enum: ToolCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(ToolCategory)
  category?: ToolCategory;
}
