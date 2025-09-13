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
import { UserContext } from 'src/common/decorators/app.decorator';
import { WorkspaceId } from 'src/common/decorators/workspace-id.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { CreateTemplateDTO } from './dto/createTemplate.dto';
import {
  UploadTemplateDTO,
  UploadTemplateResponseDTO,
} from './dto/uploadTemplate.dto';
import { Template } from './entities/templates.entity';
import { TemplatesService } from './templates.service';
import { RenameTemplateDTO } from './dto/renameTemplate.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templateService: TemplatesService) {}

  @Doc({
    summary: 'Create a new templates',
    description: 'Create a new template with file stored in the storage',
    response: { serialization: Template },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post()
  createTemplate(
    @Body() dto: CreateTemplateDTO,
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.templateService.createTemplate(workspaceId, userContext, dto);
  }

  @Doc({
    summary: 'Template upload',
    description: 'Upload a template to the storage',
    response: { serialization: UploadTemplateResponseDTO },
  })
  @Post('upload')
  uploadFile(@Body() template: UploadTemplateDTO) {
    return this.templateService.uploadFile(
      template.templateId,
      template.fileContent,
    );
  }

  @Doc({
    summary: 'Rename a template file',
    description: 'Rename the display filename of a template',
    response: { serialization: Template },
    request: {
      getWorkspaceId: true,
    },
  })
  @Patch(':templateId/rename')
  renameFile(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
    @Param('templateId') templateId: string,
    @Body() dto: RenameTemplateDTO,
  ) {
    return this.templateService.renameFile(
      templateId,
      workspaceId,
      userContext,
      dto,
    );
  }

  @Doc({
    summary: 'Get a template by ID',
    description: 'Retrieve a template by its ID',
    response: { serialization: Template },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':templateId')
  getTemplateById(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
    @Param('templateId') templateId: string,
  ) {
    return this.templateService.getTemplateById(
      templateId,
      workspaceId,
      userContext,
    );
  }

  @Doc({
    summary: 'Get all templates',
    description: 'Retrieve all templates in a workspace',
    response: { serialization: GetManyResponseDto(Template) },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getAllTemplates(
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
  ) {
    return this.templateService.getAllTemplates(
      query,
      workspaceId,
      userContext,
    );
  }

  @Doc({
    summary: 'Delete a template',
    description: 'Delete a template and its associated file from storage',
    request: {
      getWorkspaceId: true,
    },
  })
  @Delete(':templateId')
  deleteTemplate(
    @WorkspaceId() workspaceId: string,
    @UserContext() userContext: UserContextPayload,
    @Param('templateId') templateId: string,
  ) {
    return this.templateService.deleteTemplate(
      templateId,
      workspaceId,
      userContext,
    );
  }
}
