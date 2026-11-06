import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetManyIssuesDto } from './dto/get-many-issues.dto';
import { AddIssueLinksDto } from './dto/issue-link.dto';
import {
  CreateIssueRuleDto,
  IssueRuleDto,
  UpdateIssueRuleDto,
} from './dto/issue-rule.dto';
import {
  ChangeIssueStatusDto,
  CreateIssueDto,
  IssueDetailDto,
  IssueListItemDto,
  UpdateIssueDto,
} from './dto/issue.dto';
import { IssuesService } from './issues.service';
import { IssueRulesService } from './rules/issue-rules.service';

const idParam = [{ name: 'id', type: String, description: 'Issue ID' }];
const ruleIdParam = [{ name: 'id', type: String, description: 'Rule ID' }];

/**
 * Issue rules. A separate controller registered BEFORE {@link IssuesController}
 * so `/issues/rules` is not taken for `/issues/:id`.
 */
@ApiTags('Issues')
@Controller('issues/rules')
export class IssueRulesController {
  constructor(private readonly rulesService: IssueRulesService) {}

  @Doc({
    summary: 'List issue rules',
    description: 'Rules that open issues from events, oldest first.',
    response: { serialization: IssueRuleDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.read')
  @Get()
  listRules(@WorkspaceId() workspaceId: string) {
    return this.rulesService.list(workspaceId);
  }

  @Doc({
    summary: 'Create issue rule',
    description: 'Adds a rule that opens or extends issues from an event.',
    response: { serialization: IssueRuleDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Post()
  createRule(
    @Body() dto: CreateIssueRuleDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.rulesService.create(dto, workspaceId, user.id);
  }

  @Doc({
    summary: 'Install default issue rules',
    description:
      'Creates the default rule ("Critical & High": high and critical findings open one remediation issue per vulnerability name) unless it exists. Returns every rule.',
    response: { serialization: IssueRuleDto, isArray: true },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Post('defaults')
  createDefaultRules(
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.rulesService.createDefaults(workspaceId, user.id);
  }

  @Doc({
    summary: 'Update issue rule',
    response: { serialization: IssueRuleDto },
    request: { getWorkspaceId: true, params: ruleIdParam },
  })
  @WorkspaceAccess('workspace.write')
  @Patch(':id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueRuleDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.rulesService.update(id, dto, workspaceId);
  }

  @Doc({
    summary: 'Delete issue rule',
    description: 'Issues the rule opened stay; they no longer point at it.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true, params: ruleIdParam },
  })
  @WorkspaceAccess('workspace.write')
  @Delete(':id')
  deleteRule(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.rulesService.delete(id, workspaceId);
  }
}

@ApiTags('Issues')
@Controller('issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Doc({
    summary: 'List issues',
    description:
      'Issues of the workspace with filters (status, type, priority, assignee, mine, overdue, linked resource, search on title or number) and progress per item.',
    response: { serialization: GetManyResponseDto(IssueListItemDto) },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.read')
  @Get()
  getMany(
    @Query() query: GetManyIssuesDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.getMany(query, workspaceId, user.id);
  }

  @Doc({
    summary: 'Create issue',
    description: 'Creates an issue, optionally linked to resources of the workspace.',
    response: { serialization: IssueDetailDto },
    request: { getWorkspaceId: true },
  })
  @WorkspaceAccess('workspace.write')
  @Post()
  create(
    @Body() dto: CreateIssueDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.createIssue(dto, workspaceId, user.id);
  }

  @Doc({
    summary: 'Get issue',
    description: 'An issue with its linked resources summarised and its progress.',
    response: { serialization: IssueDetailDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('workspace.read')
  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.getById(id, workspaceId);
  }

  @Doc({
    summary: 'Update issue',
    description:
      'Updates title, description, tags, priority, due date or assignee (a workspace member).',
    response: { serialization: IssueDetailDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('workspace.write')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.update(id, dto, user.id, workspaceId);
  }

  @Doc({
    summary: 'Change issue status',
    description:
      'Moves an issue between open, in_progress, resolved and closed. Resolved and closed need a resolution. Writes a system comment.',
    response: { serialization: IssueDetailDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('workspace.write')
  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeIssueStatusDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.changeStatus(id, dto, user.id, workspaceId);
  }

  @Doc({
    summary: 'Link resources to issue',
    description:
      'Links vulnerabilities, assets, targets, projects or runs of the workspace. Already linked resources are skipped.',
    response: { serialization: IssueDetailDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('workspace.write')
  @Post(':id/links')
  addLinks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddIssueLinksDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.addLinks(id, dto, user.id, workspaceId);
  }

  @Doc({
    summary: 'Unlink resource from issue',
    response: { serialization: IssueDetailDto },
    request: {
      getWorkspaceId: true,
      params: [
        ...idParam,
        { name: 'linkId', type: String, description: 'Link ID' },
      ],
    },
  })
  @WorkspaceAccess('workspace.write')
  @Delete(':id/links/:linkId')
  removeLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.removeLink(id, linkId, user.id, workspaceId);
  }

  @Doc({
    summary: 'Delete issue',
    description: 'Deletes the issue with its links and comments.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true, params: idParam },
  })
  @WorkspaceAccess('workspace.write')
  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.delete(id, user.id, workspaceId);
  }
}
