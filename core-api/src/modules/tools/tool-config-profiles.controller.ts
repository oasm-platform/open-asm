import { WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ToolConfigProfile } from './entities/tool-config-profiles.entity';
import { ToolConfigProfilesService } from './tool-config-profiles.service';

class ToolIdParamDto {
  @ApiProperty()
  @IsUUID()
  toolId: string;
}

@ApiTags('Tool Config Profiles')
@Controller('tools/:toolId/config-profiles')
export class ToolConfigProfilesController {
  constructor(private readonly profilesService: ToolConfigProfilesService) {}

  @Doc({
    summary: 'Create a config profile',
    description:
      'Creates a new configuration profile for a tool in the workspace. Config is validated against the tool schema, secrets are encrypted at rest.',
    response: { serialization: ToolConfigProfile },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Post()
  create(
    @Param() { toolId }: ToolIdParamDto,
    @Body() dto: CreateProfileDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.create(workspaceId, toolId, dto);
  }

  @Doc({
    summary: 'List config profiles',
    description:
      'Lists all configuration profiles for a tool in the workspace. Sensitive values are masked.',
    response: { serialization: ToolConfigProfile, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.read')
  @Get()
  list(
    @Param() { toolId }: ToolIdParamDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.list(workspaceId, toolId);
  }

  @Doc({
    summary: 'Get a config profile',
    description:
      'Retrieves a single configuration profile by ID. Sensitive values are masked.',
    response: { serialization: ToolConfigProfile },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.read')
  @ApiParam({ name: 'toolId', type: String })
  @ApiParam({ name: 'id', type: String })
  @Get(':id')
  getOne(
    @Param('toolId') _toolId: string,
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.getOne(workspaceId, id);
  }

  @Doc({
    summary: 'Update a config profile',
    description:
      'Updates an existing configuration profile. Config is re-validated against the tool schema, secrets are re-encrypted.',
    response: { serialization: ToolConfigProfile },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @ApiParam({ name: 'toolId', type: String })
  @ApiParam({ name: 'id', type: String })
  @Patch(':id')
  update(
    @Param('toolId') _toolId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.update(workspaceId, id, dto);
  }

  @Doc({
    summary: 'Delete a config profile',
    description:
      'Deletes a configuration profile. Allowed unconditionally (job pull falls back to default later).',
    response: {},
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @ApiParam({ name: 'toolId', type: String })
  @ApiParam({ name: 'id', type: String })
  @Delete(':id')
  remove(
    @Param('toolId') _toolId: string,
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.remove(workspaceId, id);
  }

  @Doc({
    summary: 'Set default profile',
    description:
      'Sets a profile as the default for its tool. Transactionally unsets the previous default.',
    response: { serialization: ToolConfigProfile },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @ApiParam({ name: 'toolId', type: String })
  @ApiParam({ name: 'id', type: String })
  @Post(':id/set-default')
  setDefault(
    @Param('toolId') _toolId: string,
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.profilesService.setDefault(workspaceId, id);
  }
}
