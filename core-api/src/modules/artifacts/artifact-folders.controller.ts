import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import { ArtifactFoldersService } from './artifact-folders.service';
import {
  ArtifactFolderDetailDto,
  ArtifactFolderDto,
  CreateArtifactFolderDto,
  GetArtifactFoldersQueryDto,
  UpdateArtifactFolderDto,
} from './dto/artifacts.dto';

const folderId = (result: unknown) => (result as { id?: string })?.id;

/** Personal folders in the workspace Files tree (creator only). */
@ApiTags('Artifacts')
@Controller('artifact-folders')
export class ArtifactFoldersController {
  constructor(private readonly foldersService: ArtifactFoldersService) {}

  @Doc({
    summary: 'List folders',
    description: 'Lists your folders directly under `parentFolderId` (the root when omitted).',
    response: { serialization: ArtifactFolderDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get()
  getMany(
    @Query() { parentFolderId }: GetArtifactFoldersQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.foldersService.getMany(workspaceId, user.id, parentFolderId);
  }

  @Doc({
    summary: 'Get a folder',
    description: 'Returns the folder with its breadcrumb path.',
    response: { serialization: ArtifactFolderDetailDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get(':id')
  getById(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.foldersService.getById(workspaceId, user.id, id);
  }

  @Doc({
    summary: 'Create a folder',
    response: { serialization: ArtifactFolderDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.folder.created, {
    resourceId: folderId,
    changes: (body) => ({
      name: { after: (body as CreateArtifactFolderDto).name },
    }),
  })
  @WorkspaceAccess('artifact.write')
  @Post()
  create(
    @Body() dto: CreateArtifactFolderDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.foldersService.create(workspaceId, user.id, dto);
  }

  @Doc({
    summary: 'Rename or move a folder',
    response: { serialization: ArtifactFolderDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.folder.updated, {
    resourceId: folderId,
    changes: (body) => {
      const { name, parentFolderId } = body as UpdateArtifactFolderDto;
      return {
        ...(name !== undefined ? { name: { after: name } } : {}),
        ...(parentFolderId !== undefined
          ? { parentFolderId: { after: parentFolderId } }
          : {}),
      };
    },
  })
  @WorkspaceAccess('artifact.write')
  @Patch(':id')
  update(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateArtifactFolderDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.foldersService.update(workspaceId, user.id, id, dto);
  }

  @Doc({
    summary: 'Delete a folder',
    description:
      'Deletes the folder, its subfolders and every file in them, and releases their storage.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.folder.deleted)
  @WorkspaceAccess('artifact.write')
  @Delete(':id')
  remove(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.foldersService.remove(workspaceId, user.id, id);
  }
}
