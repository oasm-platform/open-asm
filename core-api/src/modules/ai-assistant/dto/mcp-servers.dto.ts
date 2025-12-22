import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsUUID, IsNotEmpty } from 'class-validator';

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

  // Tool filtering
  allowed_tools?: string[] | null; // null or empty means all tools allowed

  // Timeout configuration
  timeout?: number; // timeout in seconds, default 60
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
  allowed_tools?: string[] | null;
  timeout?: number;

  // Status fields (added by backend)
  active: boolean;
  status: 'active' | 'disabled' | 'error';
  error?: string;

  // Tools and resources (added by backend)
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: any;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    mimeType?: string;
  }>;
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

/**
 * DTO for getting MCP server health
 */
export class GetMcpServerHealthDto {
  @ApiProperty({
    description: 'Name of the MCP server to check',
    example: 'oasm-platform',
  })
  @IsNotEmpty()
  serverName: string;
}

/**
 * Response DTO for getting MCP server health
 */
export class GetMcpServerHealthResponseDto {
  @ApiProperty({
    description: 'Whether the server is active and operational',
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Server status: active, disabled, or error',
    enum: ['active', 'disabled', 'error'],
  })
  status: 'active' | 'disabled' | 'error';

  @ApiProperty({
    description: 'Error message if status is error',
    required: false,
  })
  error?: string;
}
