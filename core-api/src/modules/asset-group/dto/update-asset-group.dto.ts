import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAssetGroupDto {
  @ApiProperty({
    description: 'Name of the asset group',
    example: 'Web Servers',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Hex color of the asset group',
    example: '#78716C',
    required: false,
  })
  @IsOptional()
  @IsString()
  hexColor?: string;
}
