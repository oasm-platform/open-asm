import { UserContext, WorkspaceId } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetWorkspaceConfigsDto } from './dto/get-workspace-configs.dto';
import { UpdateWorkspaceConfigsDto } from './dto/update-workspace-configs.dto';
import {
  ArchiveWorkspaceDto,
  CreateWorkspaceDto,
  GetApiKeyResponseDto,
  GetManyWorkspacesDto,
  UpdateWorkspaceDto,
} from './dto/workspaces.dto';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) { }

  @Doc({
    summary: 'Create Workspace',
    description: 'Establishes a new isolated security workspace for organizing and managing assets, targets, and vulnerabilities within a dedicated environment.',
    response: {
      serialization: Workspace,
    },
  })
  @Post()
  createWorkspace(
    @Body() dto: CreateWorkspaceDto,
    @UserContext() userContextPayload: UserContextPayload,
  ) {
    return this.workspacesService.createWorkspace(dto, userContextPayload);
  }

  @Doc({
    summary: 'Get workspace API key',
    description: 'Retrieves the authentication API key for secure access to the specified workspace, enabling programmatic interactions with workspace resources.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('api-key')
  getWorkspaceApiKey(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaceApiKey(workspaceId, userContext);
  }

  @Doc({
    summary: 'Get workspace configs',
    description: 'Retrieves the configuration settings for a specified workspace, including asset discovery and auto-enablement settings.',
    response: {
      serialization: GetWorkspaceConfigsDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('configs')
  getWorkspaceConfigs(@WorkspaceId() workspaceId: string, @UserContext() userContext: UserContextPayload,) {
    return this.workspacesService.getWorkspaceConfigs(workspaceId, userContext);
  }

  @Doc({
    summary: 'Update workspace configs',
    description: 'Updates the configuration settings for a specified workspace, including asset discovery and auto-enablement options.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Patch('configs')
  updateWorkspaceConfigs(
    @WorkspaceId() workspaceId: string,
    @Body() dto: UpdateWorkspaceConfigsDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.updateWorkspaceConfigs(workspaceId, dto, userContext);
  }

  @Doc({
    summary: 'Get Workspaces',
    description: 'Fetches a comprehensive list of security workspaces that the authenticated user has access to, providing multi-tenant organization capabilities.',
    response: {
      serialization: GetManyResponseDto(Workspace),
    },
  })
  @Get()
  getWorkspaces(
    @Query() query: GetManyWorkspacesDto,
    @UserContext() userContextPayload: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaces(query, userContextPayload);
  }

  @Doc({
    summary: 'Get Workspace By ID',
    description: 'Fetches detailed information about a specific security workspace using its unique identifier, including all associated metadata and configuration.',
    response: {
      serialization: Workspace,
    },
  })
  @Get(':id')
  async getWorkspaceById(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    const workspace = await this.workspacesService.getWorkspaceById(
      id,
      userContext,
    );

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  @Doc({
    summary: 'Update Workspace',
    description: 'Modifies the configuration and metadata of an existing security workspace, allowing for dynamic adjustments to workspace settings and properties.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Patch(':id')
  updateWorkspace(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateWorkspaceDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.updateWorkspace(id, dto, userContext);
  }

  @Doc({
    summary: 'Delete Workspace',
    description: 'Permanently removes a security workspace and all its associated data, including assets, targets, vulnerabilities, and configurations.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':id')
  deleteWorkspace(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.deleteWorkspace(id, userContext);
  }

  @Doc({
    summary: 'Rotate API key',
    description: 'Generates a new API key for the specified workspace, invalidating the previous key to enhance security and maintain authorized access.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @Post(':id/api-key/rotate')
  rotateApiKey(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.rotateApiKey(id, userContext);
  }

  @Doc({
    summary: 'Archive/Unarchive Workspace',
    description: 'Changes the archival status of a workspace, allowing for temporary deactivation or reactivation of workspace resources without permanent deletion.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Patch(':id/archived')
  makeArchived(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: ArchiveWorkspaceDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.makeArchived(id, dto.isArchived, userContext);
  }
}
