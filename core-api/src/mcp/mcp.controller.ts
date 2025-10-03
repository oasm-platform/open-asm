import { Controller, Get } from '@nestjs/common';
import { ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { McpTool } from './mcp.dto';
import { McpService } from './mcp.service';

@ApiTags('Mcp')
@Controller('mcp')
export class McpController {
    constructor(
        private mcpService: McpService,
    ) { }

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
            }
        }
    })
    @Get('tools')
    public getTools() {
        return this.mcpService.getTools();
    }
}