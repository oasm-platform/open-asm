import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';

import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { ToolsQueryDto } from './dto/tools-query.dto';
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
    response: {
      serialization: GetManyResponseDto(Tool),
    },
  })
  @Get('built-in-tools')
  async getBuiltInTools() {
    return this.toolsService.getBuiltInTools();
  }

  @Doc({
    summary: 'Get tools',
    description: 'Retrieves a list of tools with pagination.',
    response: {
      serialization: GetManyResponseDto(Tool),
    },
  })
  @Get()
  async getManyTools(@Query() query: ToolsQueryDto) {
    return this.toolsService.getManyTools(query);
  }

  @Doc({
    summary: 'Get installed tools for a workspace',
    description:
      'Retrieves a list of installed tools for a specific workspace, including built-in tools.',
    response: {
      serialization: GetManyResponseDto(Tool),
    },
  })
  @Get('installed')
  async getInstalledTools(@Query() dto: GetInstalledToolsDto) {
    return this.toolsService.getInstalledTools(dto);
  }
}
