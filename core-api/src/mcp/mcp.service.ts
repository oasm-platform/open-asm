import { Injectable } from '@nestjs/common';
import { McpRegistryService } from '@rekog/mcp-nest';
import { McpTool } from './mcp.dto';

@Injectable()
export class McpService {
    constructor(
        private mpcRegistryService: McpRegistryService,
    ) { }
    /**
     * Get all tools from all registered MCP modules.
     * @returns A flattened array of all tools from all MCP modules.
     */
    public getTools(): McpTool[] {
        const mcpModuleIds = this.mpcRegistryService.getMcpModuleIds();
        return mcpModuleIds.map(id => this.mpcRegistryService.getTools(id).map(tool => ({
            name: tool.metadata.name,
            description: tool.metadata.description,
            moduleId: id,
        }))).flat();
    }
}