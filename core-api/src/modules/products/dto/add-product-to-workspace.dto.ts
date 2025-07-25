import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddProductToWorkspaceDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    description: 'The ID of the product',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    description: 'The ID of the workspace',
  })
  @IsUUID()
  workspaceId: string;
}
