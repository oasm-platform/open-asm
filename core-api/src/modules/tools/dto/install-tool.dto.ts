import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InstallToolDto {
  @ApiProperty({
    description: 'The ID of the workspace',
  })
  @IsUUID(7)
  workspaceId: string;

  @ApiProperty({
    description: 'The ID of the tool',
  })
  @IsUUID(7)
  toolId: string;
}