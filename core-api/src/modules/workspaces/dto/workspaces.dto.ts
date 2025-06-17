import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Workspace } from '../entities/workspace.entity';

export class CreateWorkspaceDto extends PartialType(Workspace) {}

export class UpdateWorkspaceDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'My Workspace',
    description: 'The name of the workspace',
  })
  name?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    example: 'This is my workspace',
    description: 'The description of the workspace',
  })
  description?: string;
}
