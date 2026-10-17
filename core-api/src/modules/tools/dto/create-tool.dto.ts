import { ToolCategory } from '@/common/enums/enum';
import { ApiProperty, PickType } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Tool } from '../entities/tools.entity';

export class CreateToolDto extends PickType(Tool, [
  'name',
  'description',
  'logoUrl',
  'version',
] as const) {
  @ApiProperty({ enum: ToolCategory, enumName: 'ToolCategory', isArray: true })
  @IsEnum(ToolCategory, { each: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  categories: ToolCategory[];

  @ApiProperty({
    description: 'The ID of the provider',
  })
  @IsUUID()
  @IsOptional()
  providerId: string;
}
