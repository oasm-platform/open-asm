import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsString, IsUUID } from 'class-validator';

export class WorkspaceMemoryResponseDto {
  @ApiProperty({
    description: 'Unique workspace memory identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Workspace that owns the memory',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  workspaceId: string;

  @ApiProperty({
    description: 'User whose conversations share this memory',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Long-term agent memory stored as Markdown',
    example: '## Key Facts\n- User prefers concise answers\n- Target scope: internal network',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Timestamp when the workspace memory was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the workspace memory was last updated',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  updatedAt: Date;
}
