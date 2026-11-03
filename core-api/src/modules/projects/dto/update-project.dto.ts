import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { HEX_COLOR, HEX_COLOR_MESSAGE } from './create-project.dto';

export class UpdateProjectDto {
  @ApiProperty({
    description: 'Name of the project',
    example: 'Web Servers',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    description: 'Hex color of the project',
    example: '#78716C',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: HEX_COLOR_MESSAGE })
  hexColor?: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoAddAssets?: boolean;
}
