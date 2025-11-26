import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * DTO for deleting MCP config by ID
 */
export class DeleteMcpServersDto {
  @ApiProperty({
    description: 'MCP Config ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id: string;
}

/**
 * Response DTO for deleting MCP config
 */
export class DeleteMcpServersResponseDto {
  @ApiProperty({ description: 'Whether the operation succeeded' })
  success: boolean;

  @ApiProperty({ description: 'Response message', required: false })
  message?: string;
}
