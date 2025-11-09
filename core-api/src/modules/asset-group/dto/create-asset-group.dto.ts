import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateAssetGroupDto {
  @ApiProperty({
    description: 'Name of the asset group',
    example: 'Web Servers',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'ID of the workspace the asset group belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  workspaceId: string;
}
