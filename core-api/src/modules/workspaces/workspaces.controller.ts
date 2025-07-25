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
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import {
  CreateWorkspaceDto,
  GetApiKeyResponseDto,
  UpdateWorkspaceDto,
  WorkspaceStatisticsResponseDto,
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
    summary: 'Get Workspaces',
    description: 'Retrieves a list of workspaces that the user is a member of.',
    response: {
      serialization: GetManyResponseDto(Workspace),
    },
  })
  @Get()
  getWorkspaces(
    @Query() query: GetManyBaseQueryParams,
    @UserContext() userContextPayload: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaces(query, userContextPayload);
  }

  @Doc({
    summary: 'Get Workspace Statistics',
    description: 'Retrieves statistics for a specific workspace.',
    response: {
      serialization: WorkspaceStatisticsResponseDto,
    },
  })
  @Get(':id/statistics')
  getWorkspaceStatistics(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaceStatistics(id, userContext);
  }

  @Doc({
    summary: 'Get Workspace By ID',
    description: 'Retrieves a workspace by its ID.',
    response: {
      serialization: Workspace,
    },
  })
  @Get(':id')
  getWorkspaceById(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    const workspace = this.workspacesService.getWorkspaceById(id, userContext);

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
}
