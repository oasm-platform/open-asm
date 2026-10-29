import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactFoldersService } from './artifact-folders.service';
import {
  ArtifactFolderDetailDto,
  ArtifactFolderDto,
  GetArtifactFoldersQueryDto,
} from './dto/artifacts.dto';

/** Read-only browsing of personal folders; internal services manage them. */
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
}
