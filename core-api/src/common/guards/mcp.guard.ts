import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { McpService } from 'src/mcp/mcp.service';
import { MCP_API_KEY_HEADER } from '../constants/app.constants';

/**
 * Guard to validate the presence of an MCP API key in the request headers
 * This guard checks for an 'mcp-api-key' header and validates its presence and validity
 */
@Injectable()
export class McpGuard implements CanActivate {
  constructor(
    private mcpService: McpService
  ) { }

  /**
   * Validates if the current request has a valid MCP API key in the headers
   * @param context - The execution context of the current request
   * @returns True if the MCP API key is present and valid, throws an error otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    
    // Extract the MCP API key from headers
    const mcpApiKey = request.headers[MCP_API_KEY_HEADER] as string;
    
    // Validate the API key format and existence
    this.validateApiKey(mcpApiKey);
    
    // Validate the API key with the service
    await this.validateApiKeyWithService(mcpApiKey);
    
    return true;
  }

  /**
   * Validates the API key format and existence
   * @param apiKey - The API key to validate
   * @throws UnauthorizedException if the API key is missing or invalid
   */
  private validateApiKey(apiKey: string | undefined): void {
    if (!apiKey) {
      throw new UnauthorizedException('MCP API key is missing');
    }

    // Additional validation for API key format can be added here
    // For example, checking if the key has a valid format
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new UnauthorizedException('MCP API key is invalid');
    }
  }

  /**
   * Validates the API key with the MCP service
   * @param apiKey - The API key to validate
   * @returns The MCP permissions if the key is valid
   * @throws UnauthorizedException if the API key is invalid or not found
   */
  private async validateApiKeyWithService(apiKey: string): Promise<unknown> {
    try {
      const permissions = await this.mcpService.checkApiKey(apiKey);
      
      if (!permissions) {
        throw new UnauthorizedException('MCP API key is invalid');
      }
      
      return permissions;
    } catch (error) {
      // If the service throws an UnauthorizedException, re-throw it
      // Otherwise, throw a generic unauthorized error
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('MCP API key validation failed');
    }
  }
}