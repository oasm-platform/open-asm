import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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

  @Post('message')
  async handleMessage(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleMessage(req, res);
  }
}
