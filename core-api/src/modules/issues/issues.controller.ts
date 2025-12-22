import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
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
import { CreateIssueCommentDto } from './dto/create-issue-comment.dto';
import { GetManyIssuesDto } from './dto/get-many-issues.dto';
import {
  ChangeIssueStatusDto,
  CreateIssueDto,
  UpdateIssueDto,
} from './dto/issue.dto';
import { UpdateIssueCommentDto } from './dto/update-issue-comment.dto';
import { IssueComment } from './entities/issue-comment.entity';
import { Issue } from './entities/issue.entity';
import { IssuesService } from './issues.service';

@ApiTags('Issues')
@Controller('issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Doc({
    summary: 'Get all issues',
    description: 'Retrieve a list of all issues with pagination and filtering.',
    response: {
      serialization: GetManyResponseDto(Issue),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getMany(
    @Query() query: GetManyIssuesDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.issuesService.getMany(query, workspaceId);
  }

  @Doc({
    summary: 'Create issue',
    description: 'Create a new issue linked to a source (e.g. vulnerability).',
    response: {
      serialization: Issue,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post()
  create(
    @Body() createIssueDto: CreateIssueDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.createIssue(createIssueDto, workspaceId, user.id);
  }

  @Doc({
    summary: 'Get issue by ID',
    description: 'Retrieve details of a specific issue.',
    response: {
      serialization: Issue,
    },
    request: {
      params: [
        {
          name: 'id',
          type: String,
          description: 'Issue ID',
        },
      ],
    },
  })
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.issuesService.getById(id);
  }

  @Doc({
    summary: 'Update issue',
    description: 'Update issue title and tags.',
    response: {
      serialization: Issue,
    },
    request: {
      params: [
        {
          name: 'id',
          type: String,
          description: 'Issue ID',
        },
      ],
    },
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateIssueDto: UpdateIssueDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.update(id, updateIssueDto, user.id);
  }

  @Doc({
    summary: 'Change issue status',
    description: 'Change the status of an issue.',
    response: {
      serialization: Issue,
    },
  })
  @Patch(':id/status')
  changeStatus(
    @Param() param: IdQueryParamDto,
    @Body() changeIssueStatusDto: ChangeIssueStatusDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.changeStatus(
      param.id,
      changeIssueStatusDto,
      user.id,
    );
  }

  @Doc({
    summary: 'Create comment for issue',
    description: 'Create a new comment for a specific issue.',
    response: {
      serialization: IssueComment,
    },
  })
  @Post(':issueId/comments')
  createComment(
    @Param('issueId') issueId: string,
    @Body() createCommentDto: CreateIssueCommentDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.createComment(createCommentDto, issueId, user.id);
  }

  @Doc({
    summary: 'Get comments by issue ID',
    description: 'Retrieve paginated comments for a specific issue.',
    response: {
      serialization: GetManyResponseDto(IssueComment),
    },
  })
  @Get(':issueId/comments')
  getCommentsByIssueId(
    @Param('issueId') issueId: string,
    @Query() query: GetManyBaseQueryParams,
  ) {
    return this.issuesService.getCommentsByIssueId(issueId, query);
  }

  @Doc({
    summary: 'Update comment by ID',
    description:
      'Update a comment by its ID. Only the creator of the comment can update it.',
    response: {
      serialization: IssueComment,
    },
    request: {
      params: [
        {
          name: 'id',
          type: String,
          description: 'Comment ID',
        },
      ],
    },
  })
  @Patch('comments/:id')
  updateCommentById(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateIssueCommentDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.updateCommentById(id, updateCommentDto, user.id);
  }

  @Doc({
    summary: 'Delete comment by ID',
    description:
      'Delete a comment by its ID. Only the creator of the comment can delete it.',
    response: {
      serialization: Object,
    },
    request: {
      params: [
        {
          name: 'id',
          type: String,
          description: 'Comment ID',
        },
      ],
    },
  })
  @Delete('comments/:id')
  deleteCommentById(
    @Param('id') id: string,
    @UserContext() user: UserContextPayload,
  ) {
    return this.issuesService.deleteCommentById(id, user.id);
  }
}
