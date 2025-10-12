import { ToolCategory } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
export class GetInstalledToolsDto {
  @ApiProperty({
    description: 'The ID of the workspace',
  })
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({
    enum: ToolCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(ToolCategory)
  category?: ToolCategory;
}
