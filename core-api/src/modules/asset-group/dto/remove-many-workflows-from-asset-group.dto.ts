import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class RemoveManyWorkflowsFromAssetGroupDto {
  @ApiProperty({
    description: 'Array of workflow IDs to remove',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-42614174002',
    ],
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  workflowIds: string[];
}
