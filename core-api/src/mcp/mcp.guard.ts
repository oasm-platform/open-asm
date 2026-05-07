import { MCP_API_KEY_HEADER } from '@/common/constants/app.constants';
import { ApiKeyType } from '@/common/enums/enum';
import { ApiKeysService } from '@/modules/apikeys/apikeys.service';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

/**
 * Guard to validate the presence of an MCP API key in the request headers
 * This guard checks for an 'mcp-api-key' header and validates its presence and validity
 */
@Injectable()
export class McpGuard implements CanActivate {
  constructor(private apiKeyService: ApiKeysService) {}

  /**
   * Validates if the current request has a valid MCP API key in the headers
   * @param context - The execution context of the current request
   * @returns True if the MCP API key is present and valid, throws an error otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    // Extract the MCP API key from headers
    const mcpApiKey = request.headers[MCP_API_KEY_HEADER] as string;

    if (!mcpApiKey) {
      throw new Error('MCP API key is required');
    }

    const check = await this.apiKeyService.findByKey(mcpApiKey);
    if (!check || !check?.ref || check.type !== ApiKeyType.WORKSPACE) {
      throw new Error('MCP API key is invalid');
    }

    const workspaceId = check?.ref;
    request.headers[mcpApiKey] = workspaceId;
    return true;
  }
}
