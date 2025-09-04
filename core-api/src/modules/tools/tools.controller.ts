import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceId } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';

import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { CreateToolDto } from './dto/create-tool.dto';
import { GetApiKeyResponseDto } from './dto/get-apikey-response.dto';
import { GetInstalledToolsDto } from './dto/get-installed-tools.dto';
import { GetToolByIdDto } from './dto/get-tool-by-id.dto';
import { InstallToolDto } from './dto/install-tool.dto';
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
    summary: 'Create a new tool',
    description: 'Creates a new tool with the provided information.',
    response: {
      serialization: Tool,
    },
  })
  @Post()
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }

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
    summary: 'Install tool',
    description:
      'Installs a tool to a specific workspace, checking for duplicates before insertion.',
    response: {
      serialization: WorkspaceTool,
    },
  })
  @Post('install')
  async installTool(@Body() dto: InstallToolDto) {
    return this.toolsService.installTool(dto);
  }

  @Doc({
    summary: 'Uninstall tool',
    description:
      'Uninstalls a tool from a specific workspace by removing the record from workspace_tools table.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('uninstall')
  async uninstallTool(@Body() dto: InstallToolDto) {
    return this.toolsService.uninstallTool(dto);
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
  async getManyTools(
    @Query() query: ToolsQueryDto,
    @WorkspaceId() workspaceId?: string,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required');
    }
    // Override the workspaceId from DTO with the one from header
    query.workspaceId = workspaceId;
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
  async getInstalledTools(
    @Query() dto: GetInstalledToolsDto,
    @WorkspaceId() workspaceId?: string,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required');
    }
    // Override the workspaceId from DTO with the one from header
    dto.workspaceId = workspaceId;
    return this.toolsService.getInstalledTools(dto);
  }

  @Doc({
    summary: 'Get tool by ID',
    description: 'Retrieves a tool by its unique identifier.',
    response: {
      serialization: Tool,
    },
  })
  @Get(':id')
  getToolById(
    @Param() { id }: GetToolByIdDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.toolsService.getToolById(id, workspaceId);
  }

  @Doc({
    summary: 'Get tool API key',
    description: 'Retrieves the API key for a tool.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Get(':id/api-key')
  getToolApiKey(@Param() { id }: IdQueryParamDto) {
    return this.toolsService.getToolApiKey(id);
  }

  @Doc({
    summary: 'Rotate tool API key',
    description: 'Regenerates the API key for a tool.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Post(':id/api-key/rotate')
  rotateToolApiKey(@Param() { id }: IdQueryParamDto) {
    return this.toolsService.rotateToolApiKey(id);
  }
}
