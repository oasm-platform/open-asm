import { UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
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
import { CommentsService } from './comments.service';
import {
  CommentResponseDto,
  CreateCommentDto,
  UpdateCommentDto,
} from './dto/comment.dto';

const issueParam = [{ name: 'issueId', type: String, description: 'Issue ID' }];
const vulnerabilityParam = [
  { name: 'vulnerabilityId', type: String, description: 'Vulnerability ID' },
];
const commentParam = [{ name: 'id', type: String, description: 'Comment ID' }];

/**
 * Comment threads of issues and vulnerabilities. Reading and posting are
 * scoped by the subject's own permission; editing and deleting a comment are
 * the author's alone (checked in the service), so those routes only require
 * workspace membership.
 */
@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Doc({
    summary: 'List issue comments',
    description: 'Comments of an issue, oldest first.',
    response: { serialization: GetManyResponseDto(CommentResponseDto) },
    request: { getWorkspaceId: true, params: issueParam },
  })
  @WorkspaceAccess('workspace.read')
  @Get('issues/:issueId/comments')
  listIssueComments(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.list(
      { kind: 'issue', id: issueId },
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Comment on an issue',
    description:
      'Adds a comment to an issue, optionally as a reply to a comment of the same issue.',
    response: { serialization: CommentResponseDto },
    request: { getWorkspaceId: true, params: issueParam },
  })
  @WorkspaceAccess('workspace.write')
  @Post('issues/:issueId/comments')
  createIssueComment(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: CreateCommentDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.create(
      { kind: 'issue', id: issueId },
      dto,
      user.id,
      workspaceId,
    );
  }

  @Doc({
    summary: 'List vulnerability comments',
    description: 'Comments of a vulnerability, oldest first.',
    response: { serialization: GetManyResponseDto(CommentResponseDto) },
    request: { getWorkspaceId: true, params: vulnerabilityParam },
  })
  @WorkspaceAccess('vulnerability.read')
  @Get('vulnerabilities/:vulnerabilityId/comments')
  listVulnerabilityComments(
    @Param('vulnerabilityId', ParseUUIDPipe) vulnerabilityId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.list(
      { kind: 'vulnerability', id: vulnerabilityId },
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Comment on a vulnerability',
    description:
      'Adds a comment to a vulnerability, optionally as a reply to a comment of the same vulnerability.',
    response: { serialization: CommentResponseDto },
    request: { getWorkspaceId: true, params: vulnerabilityParam },
  })
  @WorkspaceAccess('vulnerability.write')
  @Post('vulnerabilities/:vulnerabilityId/comments')
  createVulnerabilityComment(
    @Param('vulnerabilityId', ParseUUIDPipe) vulnerabilityId: string,
    @Body() dto: CreateCommentDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.create(
      { kind: 'vulnerability', id: vulnerabilityId },
      dto,
      user.id,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Edit a comment',
    description: 'Only the author can edit; system comments cannot be edited.',
    response: { serialization: CommentResponseDto },
    request: { getWorkspaceId: true, params: commentParam },
  })
  @WorkspaceAccess()
  @Patch('comments/:id')
  updateComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.update(id, dto, user.id, workspaceId);
  }

  @Doc({
    summary: 'Delete a comment',
    description:
      'Soft-deletes a comment. Only the author can delete; system comments cannot be deleted.',
    response: { serialization: DefaultMessageResponseDto },
    request: { getWorkspaceId: true, params: commentParam },
  })
  @WorkspaceAccess()
  @Delete('comments/:id')
  deleteComment(
    @Param('id', ParseUUIDPipe) id: string,
    @UserContext() user: UserContextPayload,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.commentsService.delete(id, user.id, workspaceId);
  }
}
