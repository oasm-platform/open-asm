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
import { UserContext, WorkspaceId } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
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
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Doc({
    summary: 'Create Workspace',
    description: 'Creates a new workspace.',
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
    description: 'Retrieves the API key for a workspace.',
    response: {
      serialization: GetApiKeyResponseDto,
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
    summary: 'Get Workspaces',
    description: 'Retrieves a list of workspaces that the user is a member of.',
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
    description: 'Retrieves a workspace by its ID.',
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
    description: 'Updates a workspace by its ID.',
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
    description: 'Deletes a workspace by its ID.',
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
    description: 'Regenerates the API key for a workspace.',
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
    description: 'Sets the archived status of a workspace.',
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
