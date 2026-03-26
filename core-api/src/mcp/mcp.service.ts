import { GET_WORKSPACE_MCP_TOOL_NAME } from '@/common/constants/app.constants';
import { ApiKeysService } from '@/modules/apikeys/apikeys.service';
import { Injectable } from '@nestjs/common';
import { McpRegistryService } from '@rekog/mcp-nest';
import { McpTool } from './dto/mcp.dto';
@Injectable()
export class McpService {
  constructor(
    private mcpRegistryService: McpRegistryService,
    private apiKeyService: ApiKeysService,
  ) {}

  /**
   * Get all tools from all registered MCP modules.
   * @returns A flattened array of all tools from all MCP modules.
   */
  public getMcpTools(): McpTool[] {
    const mcpModuleIds = this.mcpRegistryService.getMcpModuleIds();
    return mcpModuleIds
      .map((id) =>
        this.mcpRegistryService.getTools(id).map((tool) => ({
          name: tool.metadata.name,
          type: tool.type,
          description: tool.metadata.description,
          moduleId: id,
        })),
      )
      .flat()
      .filter((tool) => tool.name !== GET_WORKSPACE_MCP_TOOL_NAME);
  }
}
