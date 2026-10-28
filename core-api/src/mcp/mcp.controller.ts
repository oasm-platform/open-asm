import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { McpGuard } from './mcp.guard';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get()
  @UseGuards(McpGuard)
  async handleSSE(@Req() req: RequestWithMetadata, @Res() res: NodeResponse): Promise<void> {
    const workspaceId = req.workspaceId;
    await this.mcpService.handleSSEConnection(workspaceId, req, res);
  }

  @UseGuards(McpGuard)
  @Post('message')
  async handleMessage(@Req() req: NodeRequest, @Res() res: NodeResponse): Promise<void> {
    await this.mcpService.handleMessage(req, res);
  }
}
