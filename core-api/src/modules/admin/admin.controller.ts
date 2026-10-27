import { Public, Roles } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { Role } from '@/common/enums/enum';
import { ArtifactQuotaService } from '@/modules/artifacts/artifact-quota.service';
import {
  UpdateStorageQuotaDto,
  WorkspaceStorageQuotaDto,
} from '@/modules/artifacts/dto/artifacts.dto';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { PublishEvent } from '@/modules/event-bridge/publishing/publish-event.decorator';
import { CreateToolDto } from '@/modules/tools/dto/create-tool.dto';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { ToolsService } from '@/modules/tools/tools.service';
import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateFirstAdminDto } from './dto/admin.dto';

/**
 * System administration endpoints.
 * Every route requires the ADMIN role unless marked @Public().
 */
@ApiTags('Admin')
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly toolsService: ToolsService,
    private readonly artifactQuotaService: ArtifactQuotaService,
  ) {}

  @Public()
  @Doc({
    summary: 'Creates the first admin user in the system.',
    description:
      'Creates the first admin user in the system. Refused once an admin exists.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('init')
  createFirstAdmin(
    @Body() dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.adminService.createFirstAdmin(dto);
  }

  @Doc({
    summary: 'Create a new tool',
    description:
      'Registers a new security assessment tool in the system with specified configuration and capabilities.',
    response: {
      serialization: Tool,
    },
  })
  @Post('tools')
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }

  @Doc({
    summary: 'Set a workspace storage quota',
    description:
      'Overrides the storage quota of one workspace. `null` resets it to the server default (ARTIFACT_WORKSPACE_QUOTA_BYTES).',
    response: {
      serialization: WorkspaceStorageQuotaDto,
    },
  })
  @PublishEvent(EVENT_CATALOG.storage.quota.updated, {
    workspaceId: (result) =>
      (result as WorkspaceStorageQuotaDto | undefined)?.workspaceId,
    changes: (body) => ({
      quotaBytes: { after: (body as UpdateStorageQuotaDto).quotaBytes },
    }),
  })
  @Patch('workspaces/:id/storage-quota')
  updateWorkspaceStorageQuota(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateStorageQuotaDto,
  ): Promise<WorkspaceStorageQuotaDto> {
    return this.artifactQuotaService.setQuota(id, dto.quotaBytes);
  }
}
