import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { McpGuard } from './mcp.guard';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get()
  @UseGuards(McpGuard)
  async handleSSE(@Req() req: RequestWithMetadata, @Res() res: Response): Promise<void> {
    const workspaceId = req.workspaceId;
    await this.mcpService.handleSSEConnection(workspaceId, req, res);
  }

  // SECURITY: this handler had no guard at all, so the only thing standing
  // between an unauthenticated caller and the MCP transport was the
  // unguessability of a `sessionId`. Adding McpGuard means every message is
  // bound to a valid, non-revoked workspace API key.

  @Post('message')
  @UseGuards(McpGuard)
  async handleMessage(@Req() req: RequestWithMetadata, @Res() res: Response): Promise<void> {
    await this.mcpService.handleMessage(req, res);
  }
}
