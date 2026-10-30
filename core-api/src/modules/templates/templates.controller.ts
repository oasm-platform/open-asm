import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import type {
  RequestWithMetadata,
  UserContextPayload,
} from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArtifactDto } from '../artifacts/dto/artifacts.dto';
import { EVENT_CATALOG } from '../event-bridge/contracts/event-catalog';
import { PublishEvent } from '../event-bridge/publishing/publish-event.decorator';
import {
  CreateTemplateDto,
  GetTemplatesQueryDto,
  RenameTemplateDto,
  SaveTemplateContentDto,
  TemplateContentDto,
} from './dto/templates.dto';
import { TemplatesService } from './templates.service';

@ApiTags('Templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Doc({
    summary: 'List custom templates',
    description:
      'Templates I created (`mine`, default) or that are public or shared with me (`shared`).',
    response: { serialization: GetManyResponseDto(ArtifactDto) },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get()
  getMany(
    @Query() query: GetTemplatesQueryDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.templatesService.getMany(workspaceId, user.id, query);
  }

  @Doc({
    summary: 'Get a template with its YAML',
    response: { serialization: TemplateContentDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.read')
  @Get(':id/content')
  getContent(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
    @Req() req: RequestWithMetadata,
  ) {
    return this.templatesService.getContent(
      workspaceId,
      user.id,
      id,
      req.permissions ?? [],
    );
  }

  @Doc({
    summary: 'Create a template',
    description: 'Validates the YAML and stores it in the custom-templates folder.',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('artifact.write')
  @Post()
  create(
    @Body() dto: CreateTemplateDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.templatesService.create(workspaceId, user.id, dto);
  }

  @Doc({
    summary: 'Save template content',
    description: 'Owner only. Replaces the YAML; 409 when the workspace quota is full.',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.updated, { resourceIdFromRoute: true })
  @WorkspaceAccess('artifact.write')
  @Put(':id/content')
  saveContent(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: SaveTemplateContentDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.templatesService.saveContent(workspaceId, user.id, id, dto);
  }

  @Doc({
    summary: 'Rename a template',
    description: 'Owner only.',
    response: { serialization: ArtifactDto },
    request: { getWorkspaceId: true },
  })
  @PublishEvent(EVENT_CATALOG.artifact.updated, { resourceIdFromRoute: true })
  @WorkspaceAccess('artifact.write')
  @Patch(':id')
  rename(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: RenameTemplateDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.templatesService.rename(workspaceId, user.id, id, dto);
  }
}
