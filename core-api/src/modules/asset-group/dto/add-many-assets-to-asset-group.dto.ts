import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AddManyAssetsToAssetGroupDto {
  @ApiProperty({
    description: 'ID of the asset group',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  assetGroupId: string;

  @ApiProperty({
    description: 'Array of asset IDs to add',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  assetIds: string[];
}
