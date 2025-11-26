import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { McpServerConfigWithStatus } from './get-mcp-servers.dto';

/**
 * MCP Server configuration matching Claude Desktop format
 */
export interface McpServerConfig {
  // For HTTP/SSE transport
  url?: string;
  headers?: Record<string, string>;

  // For stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // Server state
  disabled?: boolean;
}

/**
 * MCP configuration JSON structure
 */
export interface McpConfigJson {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * DTO for adding MCP servers
 */
export class AddMcpServersDto {
  @ApiProperty({
    description: 'MCP servers configuration object',
    example: {
      'oasm-platform': {
        url: 'http://localhost:5173/api/mcp',
        headers: { 'api-key': '5cN3KVQ9...' },
        disabled: false,
      },
      searxng: {
        command: 'npx',
        args: ['-y', 'mcp-searxng'],
        env: { SEARXNG_URL: 'http://localhost:8081' },
        disabled: false,
      },
    },
  })
  @IsObject()
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Response DTO for adding MCP servers
 */
export class AddMcpServersResponseDto {
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
    description: 'MCP servers configuration with status',
  })
  mcpServers: Record<string, McpServerConfigWithStatus>;

  @ApiProperty({ description: 'Whether the operation succeeded' })
  success: boolean;

  @ApiProperty({
    description: 'Error message if operation failed',
    required: false,
  })
  error?: string;
}
