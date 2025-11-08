import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class RemoveManyToolsFromAssetGroupDto {
  @ApiProperty({
    description: 'ID of the asset group',
    example: '123e4567-e89b-12d3-a456-42614174000',
  })
  @IsUUID()
  assetGroupId: string;

  @ApiProperty({
    description: 'Array of tool IDs to remove',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-42614174002',
    ],
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  toolIds: string[];
}
