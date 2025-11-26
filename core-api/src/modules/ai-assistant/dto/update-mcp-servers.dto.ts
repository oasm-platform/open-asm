import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { McpServerConfig } from './add-mcp-servers.dto';
import { McpServerConfigWithStatus } from './get-mcp-servers.dto';

/**
 * DTO for updating MCP servers
 */
export class UpdateMcpServersDto {
  @ApiProperty({
    description: 'MCP servers configuration object',
    example: {
      'oasm-platform': {
        url: 'http://localhost:5173/api/mcp',
        headers: { 'api-key': 'updated-key' },
        disabled: false,
      },
    },
  })
  @IsObject()
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Response DTO for updating MCP servers
 */
export class UpdateMcpServersResponseDto {
  @ApiProperty({
    description: 'Config ID',
    required: false,
  })
  id?: string;

  @ApiProperty({
    description: 'Workspace ID',
    required: false,
  })
  workspace_id?: string;

  @ApiProperty({
    description: 'User ID',
    required: false,
  })
  user_id?: string;

  @ApiProperty({
    description: 'Created timestamp',
    required: false,
  })
  created_at?: string;

  @ApiProperty({
    description: 'Updated timestamp',
    required: false,
  })
  updated_at?: string;

  @ApiProperty({
    description: 'Updated MCP servers configuration with status',
  })
  mcpServers: Record<string, McpServerConfigWithStatus>;

  @ApiProperty({ description: 'Whether the operation succeeded' })
  success: boolean;
}
