import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import type {
  RequestWithMetadata,
  UserContextPayload,
} from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { ArtifactQuotaService } from './artifact-quota.service';
import { ArtifactsService } from './artifacts.service';
import {
  ArtifactDownloadDto,
  ArtifactDto,
  ArtifactUsageDto,
  ArtifactUserDto,
  GetArtifactsQueryDto,
  PresignArtifactDto,
  PresignArtifactResponseDto,
  ShareArtifactDto,
  ShareArtifactResponseDto,
  UpdateArtifactDto,
} from './dto/artifacts.dto';

const artifactId = (result: unknown) => (result as { id?: string })?.id;

@ApiTags('Artifacts')
@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifactsService: ArtifactsService,
    private readonly quotaService: ArtifactQuotaService,
  ) {}

  @Doc({
    summary: 'Start a file upload',
    description:
      'Reserves workspace quota for a pending file and returns a presigned POST whose policy pins the exact size and content type. Returns 409 STORAGE_QUOTA_EXCEEDED when the workspace is full.',
    response: { serialization: PresignArtifactResponseDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.created, {
    resourceId: (result) =>
      (result as PresignArtifactResponseDto | undefined)?.artifact.id,
    metadata: (body) => ({
      sizeBytes: (body as PresignArtifactDto).sizeBytes,
      contentType: (body as PresignArtifactDto).contentType,
    }),
  })
  @WorkspaceAccess('artifact.write')
  @Post('presign')
  presign(
    @Body() dto: PresignArtifactDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.presignUpload(workspaceId, user.id, dto);
  }

  @Doc({
    summary: 'Finish a file upload',
    description:
      'Checks the uploaded object against the declared size and marks the file ready. Creator only.',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.upload.completed, {
    resourceId: artifactId,
  })
  @WorkspaceAccess('artifact.write')
  @Post(':id/complete')
  complete(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.completeUpload(workspaceId, user.id, id);
  }

  @Doc({
    summary: 'List files',
    description:
      'Lists ready files: `mine` (default), `shared` with me, or `all` (requires artifact.manage).',
    response: { serialization: GetManyResponseDto(ArtifactDto) },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get()
  getMany(
    @Query() query: GetArtifactsQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
    @Req() req: RequestWithMetadata,
  ) {
    return this.artifactsService.getMany(
      workspaceId,
      user.id,
      query,
      req.permissions ?? [],
    );
  }

  @Doc({
    summary: 'Get workspace storage usage',
    description:
      'Quota, used and reserved bytes, the per-file limit, and usage by source and by creator.',
    response: { serialization: ArtifactUsageDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get('usage')
  getUsage(@WorkspaceId() workspaceId: string) {
    return this.quotaService.getUsage(workspaceId);
  }

  @Doc({
    summary: 'Get a file',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get(':id')
  getById(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
    @Req() req: RequestWithMetadata,
  ) {
    return this.artifactsService.getById(
      workspaceId,
      user.id,
      id,
      req.permissions ?? [],
    );
  }

  @Doc({
    summary: 'Get a download URL',
    description:
      'Returns a short-lived presigned URL that downloads the file as an attachment.',
    response: { serialization: ArtifactDownloadDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.downloaded)
  @WorkspaceAccess('artifact.read')
  @Get(':id/download')
  download(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.getDownloadUrl(workspaceId, user.id, id);
  }

  @Doc({
    summary: 'Rename a file or change its access',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.updated, {
    resourceId: artifactId,
    changes: (body) => {
      const { name, shareType } = body as UpdateArtifactDto;
      return {
        ...(name !== undefined ? { name: { after: name } } : {}),
        ...(shareType !== undefined ? { shareType: { after: shareType } } : {}),
      };
    },
  })
  @WorkspaceAccess('artifact.write')
  @Patch(':id')
  update(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateArtifactDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.update(workspaceId, user.id, id, dto);
  }

  @Doc({
    summary: 'Delete a file',
    description:
      'Deletes the file and releases its storage. Allowed for the creator and artifact.manage holders.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.deleted)
  @WorkspaceAccess('artifact.write')
  @Delete(':id')
  remove(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
    @Req() req: RequestWithMetadata,
  ) {
    return this.artifactsService.remove(
      workspaceId,
      user.id,
      id,
      req.permissions ?? [],
    );
  }

  @Doc({
    summary: 'List the members a file is shared with',
    response: { serialization: ArtifactUserDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.write')
  @Get(':id/shares')
  getShares(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.getShares(workspaceId, user.id, id);
  }

  @Doc({
    summary: 'Share a file with workspace members by email',
    description:
      'Adds workspace members to the share list. Emails that are not members of this workspace (or the owner) are skipped.',
    response: { serialization: ShareArtifactResponseDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.shared, {
    metadata: (_body, result) => ({
      shared: (result as ShareArtifactResponseDto | undefined)?.shared ?? 0,
    }),
  })
  @WorkspaceAccess('artifact.write')
  @Post(':id/shares')
  addShares(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: ShareArtifactDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.addShares(
      workspaceId,
      user.id,
      id,
      dto.emails,
    );
  }

  @Doc({
    summary: 'Stop sharing a file with a member',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.write')
  @Delete(':id/shares/:userId')
  removeShare(
    @Param() { id }: IdQueryParamDto,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.artifactsService.removeShare(
      workspaceId,
      user.id,
      id,
      targetUserId,
    );
  }
}
