import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { AddToolToWorkspaceDto } from './dto/tools.dto';
import { Tool } from './entities/tools.entity';
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

  @Doc({
    summary: 'Get built-in tools',
    description: 'Retrieves a list of built-in tools.',
    response: {
      serialization: GetManyResponseDto(Tool),
    },
  })
  @Get('built-in-tools')
  async getBuiltInTools() {
    return this.toolsService.getBuiltInTools();
  }
}
