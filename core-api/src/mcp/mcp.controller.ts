import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { McpTool } from './dto/mcp.dto';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private mcpService: McpService) {}

  /**
   * Get all tools from all registered MCP modules.
   * @returns A flattened array of all tools from all MCP modules.
   */
  @Doc({
    summary: 'Get all tools from all registered MCP modules.',
    description: 'Returns a flattened array of all tools from all MCP modules.',
    response: {
      extraModels: [McpTool],
      dataSchema: {
        type: 'array',
        items: { $ref: getSchemaPath(McpTool) },
      },
    },
  })
  @Get('tools')
  public getMcpTools() {
    return this.mcpService.getMcpTools();
  }
}
