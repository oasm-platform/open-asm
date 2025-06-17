import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { CreateWorkspaceDto } from './dto/workspaces.dto';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';
import { DefaultMessageResponseDto } from 'src/common/dtos/default-message-response.dto';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Doc({
    summary: 'Create Workspace',
    description: 'Creates a new workspace.',
    response: {
      serialization: DefaultMessageResponseDto,
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
      serialization: GetManyResponseDto<Workspace>,
    },
  })
  @Get()
  getWorkspaces(
    @Query() query: GetManyBaseQueryParams,
    @UserContext() userContextPayload: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaces(query, userContextPayload);
  }
}
