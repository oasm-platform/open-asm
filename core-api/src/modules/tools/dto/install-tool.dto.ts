import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InstallToolDto {
  @ApiProperty({
    description: 'The ID of the workspace',
  })
  @IsUUID()
  workspaceId: string;

  @ApiProperty({
    description: 'The ID of the tool',
  })
  @IsUUID()
  toolId: string;
}