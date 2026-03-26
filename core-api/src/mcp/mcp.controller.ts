import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private mcpService: McpService) {}
}
