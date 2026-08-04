import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { IsCronSchedule } from './cron-schedule.validator';

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
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'hexColor must be a 6-digit hex color, e.g. `#78716C`',
  })
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
  @ArrayUnique()
  @ArrayMaxSize(1000)
  hostIds?: string[];

  @ApiProperty({
    description:
      'Cron schedule for the group workflow (e.g. "0 0 */3 * *"). Requires toolIds.',
    example: '0 0 */3 * *',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsCronSchedule()
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
  @ArrayUnique()
  @ArrayMaxSize(1000)
  toolIds?: string[];
}
