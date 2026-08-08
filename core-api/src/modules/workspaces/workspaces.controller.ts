import {
  Public,
  UserContext,
  WorkspaceId,
} from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
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
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { GetWorkspaceConfigsDto } from './dto/get-workspace-configs.dto';
import { UpdateWorkspaceConfigsDto } from './dto/update-workspace-configs.dto';
import {
  CreateInvitationsDto,
  InvitationPreviewDto,
  InvitationTokenDto,
  PermissionCatalogResourceDto,
  UpdateMemberPermissionsDto,
  UpdatePermissionGroupDto,
  CreatePermissionGroupDto,
  CreateInvitationsResponseDto,
} from './dto/workspace-access.dto';
import {
  ArchiveWorkspaceDto,
  CreateWorkspaceDto,
  GetApiKeyResponseDto,
  GetManyWorkspacesDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from './dto/workspaces.dto';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Doc({
    summary: 'Create Workspace',
    description:
      'Establishes a new isolated security workspace for organizing and managing assets, targets, and vulnerabilities within a dedicated environment.',
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
    description:
      'Retrieves the authentication API key for secure access to the specified workspace, enabling programmatic interactions with workspace resources.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.apikey')
  @Get('api-key')
  getWorkspaceApiKey(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaceApiKey(workspaceId, userContext);
  }

  @Doc({
    summary: 'Get workspace configs',
    description:
      'Retrieves the configuration settings for a specified workspace, including asset discovery and auto-enablement settings.',
    response: {
      serialization: GetWorkspaceConfigsDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.read')
  @Get('configs')
  getWorkspaceConfigs(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.getWorkspaceConfigs(workspaceId, userContext);
  }

  @Doc({
    summary: 'Update workspace configs',
    description:
      'Updates the configuration settings for a specified workspace, including asset discovery and auto-enablement options.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.config')
  @Patch('configs')
  updateWorkspaceConfigs(
    @WorkspaceId() workspaceId: string,
    @Body() dto: UpdateWorkspaceConfigsDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.updateWorkspaceConfigs(
      workspaceId,
      dto,
      userContext,
    );
  }

  @Doc({
    summary: 'Get Workspaces',
    description:
      'Fetches a comprehensive list of security workspaces that the authenticated user has access to, providing multi-tenant organization capabilities.',
    response: {
      serialization: GetManyResponseDto(WorkspaceResponseDto),
    },
  })
  @Get()
  getWorkspaces(
    @Query() query: GetManyWorkspacesDto,
    @UserContext() userContextPayload: UserContextPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.workspacesService.getWorkspaces(
      query,
      userContextPayload,
      req,
      res,
    );
  }

  // -------------------------------------------------------------------------
  // Member management (permission-based)
  // -------------------------------------------------------------------------

  @Doc({
    summary: 'Get workspace members',
    description:
      'Lists all members of the workspace with their permission groups. Requires member.read.',
    response: { serialization: WorkspaceMembers, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('member.read')
  @Get('members')
  getWorkspaceMembers(@WorkspaceId() workspaceId: string) {
    return this.workspacesService.getMembersWithPermissions(workspaceId);
  }

  @Doc({
    summary: 'Update member permissions',
    description:
      'Replaces the permission groups assigned to a member. The owner and the acting user cannot be modified. Requires member.write.',
    response: { serialization: WorkspaceMembers },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('member.write')
  @Patch('members/:memberId')
  updateMemberPermissions(
    @WorkspaceId() workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberPermissionsDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.workspacesService.updateMemberPermissions(
      workspaceId,
      memberId,
      dto.permissionIds,
      user.id,
    );
  }

  @Doc({
    summary: 'Remove workspace member',
    description:
      'Removes a member from the workspace. The owner and the acting user cannot be removed. Requires member.write.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('member.write')
  @Delete('members/:memberId')
  removeMember(
    @WorkspaceId() workspaceId: string,
    @Param('memberId') memberId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      memberId,
      user.id,
    );
  }

  // -------------------------------------------------------------------------
  // Permission groups
  // -------------------------------------------------------------------------

  @Doc({
    summary: 'Get permission catalog',
    description:
      'Lists every permission resource with its selectable actions and labels. Used by the permission group editor. Requires member.read.',
    response: {
      serialization: PermissionCatalogResourceDto,
      isArray: true,
    },
  })
  @WorkspaceAccess('member.read')
  @Get('permissions/catalog')
  getPermissionCatalog() {
    return this.workspacesService.getPermissionCatalog();
  }

  @Doc({
    summary: 'Get permission groups',
    description:
      'Lists the permission groups of the workspace. Requires member.read.',
    response: { serialization: WorkspacePermission, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('member.read')
  @Get('permissions')
  getPermissionGroups(@WorkspaceId() workspaceId: string) {
    return this.workspacesService.getPermissionGroups(workspaceId);
  }

  @Doc({
    summary: 'Create permission group',
    description:
      'Creates a permission group. The wildcard "*" is reserved for the system Admin group. Requires workspace.write.',
    response: { serialization: WorkspacePermission },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Post('permissions')
  createPermissionGroup(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreatePermissionGroupDto,
  ) {
    return this.workspacesService.createPermissionGroup(workspaceId, dto);
  }

  @Doc({
    summary: 'Update permission group',
    description:
      'Updates the name or permission keys of a non-system group. Requires workspace.write.',
    response: { serialization: WorkspacePermission },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Patch('permissions/:permissionId')
  updatePermissionGroup(
    @WorkspaceId() workspaceId: string,
    @Param('permissionId') permissionId: string,
    @Body() dto: UpdatePermissionGroupDto,
  ) {
    return this.workspacesService.updatePermissionGroup(
      workspaceId,
      permissionId,
      dto,
    );
  }

  @Doc({
    summary: 'Delete permission group',
    description:
      'Deletes a non-system permission group. Members lose its permissions. Requires workspace.write.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Delete('permissions/:permissionId')
  deletePermissionGroup(
    @WorkspaceId() workspaceId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.workspacesService.deletePermissionGroup(
      workspaceId,
      permissionId,
    );
  }

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------

  @Doc({
    summary: 'Create workspace invitations',
    description:
      'Invites existing users by email. The invitee receives an in-app notification with an accept/decline link. Emails without an account are skipped. Requires invitation.write.',
    response: { serialization: CreateInvitationsResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('invitation.write')
  @Post('invitations')
  createInvitations(
    @WorkspaceId() workspaceId: string,
    @Body() dto: CreateInvitationsDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.workspacesService.createInvitations(
      workspaceId,
      user.id,
      dto,
    );
  }

  @Doc({
    summary: 'List workspace invitations',
    description:
      'Lists the invitations of the workspace. Pending invitations past their expiry are reported as expired. Requires member.read.',
    response: { serialization: WorkspaceInvitation, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('member.read')
  @Get('invitations')
  listInvitations(@WorkspaceId() workspaceId: string) {
    return this.workspacesService.listInvitations(workspaceId);
  }

  @Doc({
    summary: 'Cancel workspace invitation',
    description:
      'Cancels a pending invitation so its token can no longer be used. Requires invitation.write.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('invitation.write')
  @Post('invitations/:invitationId/cancel')
  cancelInvitation(
    @WorkspaceId() workspaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspacesService.cancelInvitation(workspaceId, invitationId);
  }

  @Doc({
    summary: 'Accept workspace invitation',
    description:
      'Accepts an invitation using its token. Only the authenticated user whose email matches the invitation can accept.',
    response: { serialization: DefaultMessageResponseDto },
  })
  @Post('invitations/accept')
  acceptInvitation(
    @Body() dto: InvitationTokenDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.workspacesService.acceptInvitation(dto.token, user);
  }

  @Doc({
    summary: 'Decline workspace invitation',
    description:
      'Declines an invitation using its token. Only the authenticated user whose email matches the invitation can decline.',
    response: { serialization: DefaultMessageResponseDto },
  })
  @Post('invitations/decline')
  declineInvitation(
    @Body() dto: InvitationTokenDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.workspacesService.declineInvitation(dto.token, user);
  }

  @Doc({
    summary: 'Preview workspace invitation',
    description:
      'Public preview of an invitation by token. Exposes only the workspace name, invited email and expiry — never the token.',
    response: { serialization: InvitationPreviewDto },
  })
  @Public()
  @Get('invitations/:token')
  getInvitationPreview(@Param('token') token: string) {
    return this.workspacesService.getInvitationPreview(token);
  }

  @Doc({
    summary: 'Get Workspace By ID',
    description:
      'Fetches detailed information about a specific security workspace using its unique identifier, including all associated metadata and configuration.',
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
    description:
      'Modifies the configuration and metadata of an existing security workspace, allowing for dynamic adjustments to workspace settings and properties.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @WorkspaceAccess('workspace.write')
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
    description:
      'Permanently removes a security workspace and all its associated data, including assets, targets, vulnerabilities, and configurations.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @WorkspaceAccess('workspace.delete')
  @Delete(':id')
  deleteWorkspace(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.deleteWorkspace(id, userContext);
  }

  @Doc({
    summary: 'Rotate API key',
    description:
      'Generates a new API key for the specified workspace, invalidating the previous key to enhance security and maintain authorized access.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @WorkspaceAccess('workspace.apikey')
  @Post(':id/api-key/rotate')
  rotateApiKey(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.rotateApiKey(id, userContext);
  }

  @Doc({
    summary: 'Archive/Unarchive Workspace',
    description:
      'Changes the archival status of a workspace, allowing for temporary deactivation or reactivation of workspace resources without permanent deletion.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @WorkspaceAccess('workspace.write')
  @Patch(':id/archived')
  makeArchived(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: ArchiveWorkspaceDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.makeArchived(id, dto.isArchived, userContext);
  }
}
