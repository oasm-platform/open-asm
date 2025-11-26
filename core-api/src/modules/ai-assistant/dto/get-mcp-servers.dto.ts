import { ApiProperty } from '@nestjs/swagger';

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
