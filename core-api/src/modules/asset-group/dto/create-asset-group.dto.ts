import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssetGroupDto {
  @ApiProperty({
    description: 'Name of the asset group',
    example: 'Web Servers',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Hex color of the asset group',
    example: '#78716C',
    required: false,
  })
  @IsOptional()
  @IsString()
  hexColor?: string;

  @ApiProperty({
    description: 'Array of asset (host) IDs to add to the group',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  hostIds?: string[];

  @ApiProperty({
    description:
      'Cron schedule for the group workflow (e.g. "0 0 */3 * *"). Requires toolIds.',
    example: '0 0 */3 * *',
    required: false,
  })
  @IsOptional()
  @IsString()
  schedule?: string;

  @ApiProperty({
    description:
      'Tool IDs used to build the group workflow. When provided, a workflow is created and assigned to the group.',
    example: ['123e4567-e89b-12d3-a456-426614174003'],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  toolIds?: string[];
}
