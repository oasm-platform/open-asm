import {
  Public,
  UserContext,
  WorkspaceId,
} from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import {
  RequestWithMetadata,
  UserContextPayload,
} from '@/common/interfaces/app.interface';
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
import { AuditLog } from '../audit/audit-log.decorator';
import { AuditService } from '../audit/audit.service';
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
  CurrentPermissionResponseDto,
} from './dto/workspaces.dto';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { WorkspacePermission } from './entities/workspace-permission.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly auditService: AuditService,
  ) {}

  @Doc({
    summary: 'Create Workspace',
    description:
      'Establishes a new isolated security workspace for organizing and managing assets, targets, and vulnerabilities within a dedicated environment.',
    response: {
      serialization: Workspace,
    },
  })
  @AuditLog('workspace.created', {
    // No request workspaceId exists yet — the new workspace comes from the result.
    workspaceId: (result) => (result as { id?: string } | undefined)?.id,
    resourceId: (result) => (result as { id?: string } | undefined)?.id,
    changes: (body) => ({
      name: { after: (body as { name?: string })?.name ?? '' },
    }),
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
  @WorkspaceAccess('workspace.config')
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
  @AuditLog('workspace.config.updated')
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

  @Doc({
    summary: 'Get current workspace permissions',
    description:
      'Returns the permission keys of the authenticated user in the selected workspace, unioned across all their permission groups. Resolves the workspace from the X-Workspace-ID header or the wid cookie.',
    response: {
      serialization: CurrentPermissionResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess()
  @Get('current-permission')
  getCurrentPermission(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.getCurrentPermission(
      workspaceId,
      userContext.id,
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
    @Req() req: Request,
  ) {
    return this.workspacesService.updateMemberPermissions(
      workspaceId,
      memberId,
      dto.permissionIds,
      user.id,
      this.auditService.buildActorContext(req as RequestWithMetadata),
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
    @Req() req: Request,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      memberId,
      user.id,
      this.auditService.buildActorContext(req as RequestWithMetadata),
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
    @UserContext() user: UserContextPayload,
    @Req() req: Request,
  ) {
    return this.workspacesService.createPermissionGroup(
      workspaceId,
      dto,
      user.id,
      this.auditService.buildActorContext(req as RequestWithMetadata),
    );
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
    @UserContext() user: UserContextPayload,
    @Req() req: Request,
  ) {
    return this.workspacesService.updatePermissionGroup(
      workspaceId,
      permissionId,
      dto,
      user.id,
      this.auditService.buildActorContext(req as RequestWithMetadata),
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
    @Req() req: Request,
  ) {
    return this.workspacesService.deletePermissionGroup(
      workspaceId,
      permissionId,
      this.auditService.buildActorContext(req as RequestWithMetadata),
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
  @AuditLog('member.invited', {
    resourceType: 'invitation',
    // NEVER log raw emails — only the count. The response carries no ids,
    // so invitationIds are omitted here (see M4.1 report).
    metadata: (body) => ({
      emailsCount: (body as { emails?: string[] })?.emails?.length ?? 0,
    }),
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
      'Lists the pending invitations of the workspace. Requires member.read.',
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
  @AuditLog('member.invitation.cancelled', {
    resourceType: 'invitation',
    // invitationId lives in the route param, which is NOT exposed to the
    // decorator callbacks (body/result only) — omit + document (M4.1 report).
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
      'Fetches detailed information about a specific security workspace using its unique identifier, including all associated metadata and configuration. Requires workspace.read; the member list is only included for member.read holders.',
    response: {
      serialization: Workspace,
    },
  })
  @WorkspaceAccess('workspace.read', { workspaceParam: 'id' })
  @Get(':id')
  async getWorkspaceById(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
    @Req() req: Request,
  ) {
    const workspace = await this.workspacesService.getWorkspaceById(
      id,
      userContext,
      (req as RequestWithMetadata).permissions,
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
  @AuditLog('workspace.updated', {
    // Best-effort changes from the body — never echo back the full workspace.
    changes: (body) => {
      const dto = body as {
        name?: string;
        description?: string | null;
        archivedAt?: string | Date | null;
      };
      const changes: Record<string, { after?: unknown }> = {};
      if (dto.name !== undefined) changes.name = { after: dto.name };
      if (dto.description !== undefined) {
        changes.description = { after: dto.description };
      }
      if (dto.archivedAt !== undefined) {
        changes.isArchived = { after: dto.archivedAt !== null };
      }
      return changes;
    },
  })
  @WorkspaceAccess('workspace.write', { workspaceParam: 'id' })
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
  @WorkspaceAccess('workspace.delete', { workspaceParam: 'id' })
  @Delete(':id')
  deleteWorkspace(
    @Param() { id }: IdQueryParamDto,
    @UserContext() userContext: UserContextPayload,
    @Req() req: Request,
  ) {
    return this.workspacesService.deleteWorkspace(
      id,
      userContext,
      this.auditService.buildActorContext(req as RequestWithMetadata),
    );
  }

  @Doc({
    summary: 'Rotate API key',
    description:
      'Generates a new API key for the specified workspace, invalidating the previous key to enhance security and maintain authorized access.',
    response: {
      serialization: GetApiKeyResponseDto,
    },
  })
  @AuditLog('workspace.api_key.rotated')
  @WorkspaceAccess('workspace.apikey', { workspaceParam: 'id' })
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
  @AuditLog('workspace.updated', {
    changes: (body) => ({
      isArchived: {
        after: (body as { isArchived?: boolean })?.isArchived ?? true,
      },
    }),
  })
  @WorkspaceAccess('workspace.write', { workspaceParam: 'id' })
  @Patch(':id/archived')
  makeArchived(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: ArchiveWorkspaceDto,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.workspacesService.makeArchived(id, dto.isArchived, userContext);
  }
}
