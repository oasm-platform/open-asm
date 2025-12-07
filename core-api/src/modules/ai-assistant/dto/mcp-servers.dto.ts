import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsUUID } from 'class-validator';

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
 * Enhanced MCP server config with status
 */
export interface McpServerConfigWithStatus {
  // Transport config
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;

  // Status fields (added by backend)
  active: boolean;
  status: 'active' | 'disabled' | 'error';
  error?: string;
}

/**
 * MCP configuration JSON structure
 */
export interface McpConfigJson {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Response DTO for getting MCP servers
 */
export class GetMcpServersResponseDto {
  @ApiProperty({
    description: 'MCP servers configuration with embedded status',
    example: {
      mcpServers: {
        'oasm-platform': {
          url: 'http://localhost:5173/api/mcp',
          headers: { 'api-key': '...' },
          disabled: false,
          active: true,
          status: 'active',
        },
        searxng: {
          command: 'npx',
          args: ['-y', 'mcp-searxng'],
          disabled: false,
          active: false,
          status: 'error',
          error: 'Connection failed',
        },
      },
    },
  })
  mcpServers: Record<string, McpServerConfigWithStatus>;
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
