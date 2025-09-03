import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetToolByIdWithWorkspaceDto {
  @ApiProperty({
    description: 'The ID of the tool',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'The ID of the workspace to check installation status',
    required: false,
  })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}