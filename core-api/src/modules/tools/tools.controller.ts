import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolsService } from './tools.service';

@ApiTags('Tools')
@Controller('tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Doc({
    summary: 'Add tool to workspace',
    description: 'Adds a tool to a specific workspace.',
    response: {
      serialization: WorkspaceTool,
    },
  })
  @Post('add-to-workspace')
  async addToolToWorkspace(@Body() dto: AddToolToWorkspaceDto) {
    return this.toolsService.addToolToWorkspace(dto);
  }
}
