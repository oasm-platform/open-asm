import { Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { Role } from '@/common/enums/enum';
import { ArtifactQuotaService } from '@/modules/artifacts/artifact-quota.service';
import {
  UpdateStorageQuotaDto,
  WorkspaceStorageQuotaDto,
} from '@/modules/artifacts/dto/artifacts.dto';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { PublishEvent } from '@/modules/event-bridge/publishing/publish-event.decorator';
import { ArchiveWorkspaceDto } from '@/modules/workspaces/dto/workspaces.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminWorkspacesService } from './admin-workspaces.service';
import {
  AdminWorkspaceDto,
  GetManyAdminWorkspacesDto,
  UpdateAdminWorkspaceDto,
} from './dto/admin-workspaces.dto';

/**
 * Admin routes carry no workspace guard, so the request has no workspaceId.
 * Attribute the audit event to the workspace that was changed instead, and
 * flag it so the workspace's audit trail shows it came from a platform admin.
 */
const auditTarget = {
  workspaceId: (result: unknown) => (result as AdminWorkspaceDto | undefined)?.id,
  resourceId: (result: unknown) => (result as AdminWorkspaceDto | undefined)?.id,
  metadata: () => ({ platformAdmin: true }),
};

/**
 * Platform-wide workspace overview. Unlike /workspaces, results are not
 * limited to workspaces the caller is a member of.
 */
@ApiTags('Admin')
@Controller('admin/workspaces')
@Roles(Role.ADMIN)
export class AdminWorkspacesController {
  constructor(
    private readonly adminWorkspacesService: AdminWorkspacesService,
    private readonly artifactQuotaService: ArtifactQuotaService,
  ) {}

  @Doc({
    summary: 'List workspaces',
    description:
      'Lists every workspace on the platform with its owner, target count and member count. `search` matches the workspace name or the owner name/email.',
    response: {
      serialization: GetManyResponseDto(AdminWorkspaceDto),
    },
  })
  @Get()
  getWorkspaces(@Query() query: GetManyAdminWorkspacesDto) {
    return this.adminWorkspacesService.getWorkspaces(query);
  }

  @Doc({
    summary: 'Get workspace by ID',
    description:
      'Returns a single workspace with its owner, target count and member count. List its members with GET /admin/users?workspaceId=.',
    response: {
      serialization: AdminWorkspaceDto,
    },
  })
  @Get(':id')
  getWorkspace(@Param() { id }: IdQueryParamDto) {
    return this.adminWorkspacesService.getWorkspace(id);
  }

  @Doc({
    summary: 'Update workspace',
    description:
      'Changes the name, description or discovery settings of any workspace. Omitted fields are left unchanged.',
    response: {
      serialization: AdminWorkspaceDto,
    },
  })
  @PublishEvent(EVENT_CATALOG.workspace.updated, {
    ...auditTarget,
    // Fields come from the body (what the admin sent), values from the result
    // (what was saved, e.g. the trimmed name). A failed call has no result, so
    // it falls back to the raw body value.
    changes: (body, result) => {
      const sent = (body ?? {}) as Record<string, unknown>;
      const saved = result as Record<string, unknown> | undefined;
      const changes: Record<string, { after?: unknown }> = {};
      for (const field of [
        'name',
        'description',
        'isAssetsDiscovery',
        'isAutoEnableAssetAfterDiscovered',
      ]) {
        if (sent[field] !== undefined) {
          changes[field] = { after: saved?.[field] ?? sent[field] };
        }
      }
      return changes;
    },
  })
  @Patch(':id')
  updateWorkspace(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateAdminWorkspaceDto,
  ) {
    return this.adminWorkspacesService.updateWorkspace(id, dto);
  }

  @Doc({
    summary: 'Archive or restore workspace',
    description:
      'Archives (deactivates) a workspace or restores it. Archived workspaces drop out of their members\' workspace list; data is kept.',
    response: {
      serialization: AdminWorkspaceDto,
    },
  })
  @PublishEvent(EVENT_CATALOG.workspace.updated, {
    ...auditTarget,
    changes: (body) => ({
      isArchived: {
        after: (body as { isArchived?: boolean } | undefined)?.isArchived,
      },
    }),
  })
  @Patch(':id/archived')
  setArchived(
    @Param() { id }: IdQueryParamDto,
    @Body() { isArchived }: ArchiveWorkspaceDto,
  ) {
    return this.adminWorkspacesService.setArchived(id, isArchived);
  }

  @Doc({
    summary: 'Set workspace storage quota',
    description:
      'Overrides the storage quota of one workspace. `null` resets it to the server default (ARTIFACT_WORKSPACE_QUOTA_BYTES).',
    response: {
      serialization: WorkspaceStorageQuotaDto,
    },
  })
  @PublishEvent(EVENT_CATALOG.storage.quota.updated, {
    workspaceId: (result) =>
      (result as WorkspaceStorageQuotaDto | undefined)?.workspaceId,
    resourceId: (result) =>
      (result as WorkspaceStorageQuotaDto | undefined)?.workspaceId,
    metadata: () => ({ platformAdmin: true }),
    changes: (body) => ({
      quotaBytes: {
        after: (body as UpdateStorageQuotaDto | undefined)?.quotaBytes,
      },
    }),
  })
  @Patch(':id/storage-quota')
  updateStorageQuota(
    @Param() { id }: IdQueryParamDto,
    @Body() { quotaBytes }: UpdateStorageQuotaDto,
  ): Promise<WorkspaceStorageQuotaDto> {
    return this.artifactQuotaService.setQuota(id, quotaBytes);
  }
}
