import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ToolCategory } from 'src/common/enums/enum';
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
