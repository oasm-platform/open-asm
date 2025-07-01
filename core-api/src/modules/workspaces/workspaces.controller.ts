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
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspaces.dto';
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

  @ApiOkResponse({ type: GetManyResponseDto<Workspace> })
  @Get()
  getWorkspaces(
    @Query() query: GetManyBaseQueryParams,
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
}
