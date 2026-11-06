import type {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import {
  AuditActorType,
  AuditOutcome,
  IssueCommentType,
} from '@/common/enums/enum';
import {
  type CatalogEvent,
  EVENT_CATALOG,
} from '@/modules/event-bridge/contracts/event-catalog';
import type { EventEnvelopeData } from '@/modules/event-bridge/contracts/event-envelope';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import type {
  CommentAuthorDto,
  CommentResponseDto,
  CreateCommentDto,
  UpdateCommentDto,
} from './dto/comment.dto';
import { Comment } from './entities/comment.entity';

/** What a comment is about: exactly one subject, as the table enforces. */
export type CommentSubject =
  | { kind: 'issue'; id: string }
  | { kind: 'vulnerability'; id: string };

/** Length of the replied-to excerpt shown with a reply. */
const SNIPPET_LENGTH = 200;

const toAuthor = (
  user: { id: string; name: string; image?: string | null } | null | undefined,
): CommentAuthorDto | null =>
  user ? { id: user.id, name: user.name, image: user.image ?? null } : null;

const subjectOf = (comment: Comment): CommentSubject | null => {
  if (comment.issueId) return { kind: 'issue', id: comment.issueId };
  if (comment.vulnerabilityId) {
    return { kind: 'vulnerability', id: comment.vulnerabilityId };
  }
  return null;
};

const sameSubject = (comment: Comment, subject: CommentSubject): boolean =>
  subject.kind === 'issue'
    ? comment.issueId === subject.id
    : comment.vulnerabilityId === subject.id;

/**
 * Comments on issues and vulnerabilities, one table for both.
 *
 * Tenant scoping is by subject: an issue carries its workspace, a
 * vulnerability reaches it through asset → target. Every read and write
 * resolves the subject inside the caller's workspace first, so a comment id or
 * subject id from another workspace answers 404, never its content.
 *
 * Editing and deleting are the author's alone; system comments (status
 * changes, automation notes) are written with `isCanEdit/isCanDelete=false`
 * and refuse both.
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    @InjectRepository(Vulnerability)
    private readonly vulnerabilitiesRepository: Repository<Vulnerability>,
    private readonly eventBridge: EventBridgeService,
  ) {}

  async list(
    subject: CommentSubject,
    query: GetManyBaseQueryParams,
    workspaceId: string,
  ): Promise<GetManyBaseResponseDto<CommentResponseDto>> {
    await this.assertSubjectInWorkspace(subject, workspaceId);
    const { page, limit } = query;
    const qb = this.baseQuery()
      .andWhere(
        subject.kind === 'issue'
          ? 'comment.issueId = :subjectId'
          : 'comment.vulnerabilityId = :subjectId',
        { subjectId: subject.id },
      )
      // Newest last: a thread reads top to bottom.
      .orderBy('comment.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    const [comments, total] = await qb.getManyAndCount();
    return getManyResponse({
      query,
      data: comments.map((comment) => this.toDto(comment)),
      total,
    });
  }

  async create(
    subject: CommentSubject,
    dto: CreateCommentDto,
    userId: string,
    workspaceId: string,
  ): Promise<CommentResponseDto> {
    await this.assertSubjectInWorkspace(subject, workspaceId);

    if (dto.repCommentId) {
      // `findOne` skips soft-deleted rows: a reply to a deleted comment is
      // refused rather than threaded under a placeholder.
      const replied = await this.commentsRepository.findOne({
        where: { id: dto.repCommentId },
      });
      if (!replied || !sameSubject(replied, subject)) {
        throw new BadRequestException(
          'The replied-to comment does not belong to this thread',
        );
      }
    }

    const saved = await this.commentsRepository.save(
      this.commentsRepository.create({
        content: dto.content,
        ...(dto.repCommentId ? { repCommentId: dto.repCommentId } : {}),
        ...(subject.kind === 'issue'
          ? { issueId: subject.id }
          : { vulnerabilityId: subject.id }),
        createdById: userId,
        type: IssueCommentType.CONTENT,
        isCanEdit: true,
        isCanDelete: true,
      }),
    );

    await this.publish(
      subject.kind === 'issue'
        ? EVENT_CATALOG.issue.comment.created
        : EVENT_CATALOG.vulnerability.comment.created,
      subject,
      saved.id,
      userId,
      workspaceId,
    );
    return this.getOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    userId: string,
    workspaceId: string,
  ): Promise<CommentResponseDto> {
    const { comment, subject } = await this.findOwnEditable(
      id,
      userId,
      workspaceId,
      'edit',
    );
    comment.content = dto.content;
    await this.commentsRepository.save(comment);
    if (subject.kind === 'issue') {
      await this.publish(
        EVENT_CATALOG.issue.comment.updated,
        subject,
        comment.id,
        userId,
        workspaceId,
      );
    }
    return this.getOne(comment.id);
  }

  async delete(
    id: string,
    userId: string,
    workspaceId: string,
  ): Promise<{ message: string }> {
    const { comment } = await this.findOwnEditable(
      id,
      userId,
      workspaceId,
      'delete',
    );
    await this.commentsRepository.softDelete(comment.id);
    return { message: 'Comment deleted successfully' };
  }

  /**
   * Throws 404 unless the subject exists in `workspaceId`. A vulnerability
   * reaches its workspace through asset → target.
   */
  async assertSubjectInWorkspace(
    subject: CommentSubject,
    workspaceId: string,
  ): Promise<void> {
    if (subject.kind === 'issue') {
      const issue = await this.issuesRepository.findOne({
        where: { id: subject.id, workspaceId },
        select: { id: true },
      });
      if (!issue) {
        throw new NotFoundException(`Issue with ID ${subject.id} not found`);
      }
      return;
    }
    const vulnerability = await this.vulnerabilitiesRepository
      .createQueryBuilder('vulnerability')
      .select('vulnerability.id')
      .innerJoin('vulnerability.asset', 'asset')
      .innerJoin('asset.target', 'target')
      .where('vulnerability.id = :id', { id: subject.id })
      .andWhere('target.workspaceId = :workspaceId', { workspaceId })
      .getOne();
    if (!vulnerability) {
      throw new NotFoundException(
        `Vulnerability with ID ${subject.id} not found`,
      );
    }
  }

  private async findOwnEditable(
    id: string,
    userId: string,
    workspaceId: string,
    action: 'edit' | 'delete',
  ): Promise<{ comment: Comment; subject: CommentSubject }> {
    const comment = await this.commentsRepository.findOne({ where: { id } });
    const subject = comment ? subjectOf(comment) : null;
    if (!comment || !subject) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    try {
      await this.assertSubjectInWorkspace(subject, workspaceId);
    } catch {
      // Same answer as a missing comment: the id must not reveal that it
      // exists in another workspace.
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    const allowed = action === 'edit' ? comment.isCanEdit : comment.isCanDelete;
    if (!allowed) {
      throw new ForbiddenException(`This comment cannot be ${action}ed`);
    }
    if (comment.createdById !== userId) {
      throw new ForbiddenException(
        `Only the author of the comment can ${action} it`,
      );
    }
    return { comment, subject };
  }

  private baseQuery(): SelectQueryBuilder<Comment> {
    // `withDeleted` so a reply still shows that its parent was deleted; the
    // listed comments themselves are filtered explicitly.
    return this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .leftJoin('comment.createdBy', 'author')
      .leftJoin('comment.repComment', 'repComment')
      .leftJoin('repComment.createdBy', 'repAuthor')
      .select([
        'comment',
        'author.id',
        'author.name',
        'author.image',
        'repComment.id',
        'repComment.content',
        'repComment.deletedAt',
        'repAuthor.id',
        'repAuthor.name',
        'repAuthor.image',
      ])
      .where('comment.deletedAt IS NULL');
  }

  private async getOne(id: string): Promise<CommentResponseDto> {
    const comment = await this.baseQuery()
      .andWhere('comment.id = :id', { id })
      .getOne();
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    return this.toDto(comment);
  }

  toDto(comment: Comment): CommentResponseDto {
    const rep = comment.repComment;
    return {
      id: comment.id,
      content: comment.content,
      type: comment.type,
      issueId: comment.issueId ?? null,
      vulnerabilityId: comment.vulnerabilityId ?? null,
      isCanEdit: comment.isCanEdit,
      isCanDelete: comment.isCanDelete,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: toAuthor(comment.createdBy),
      repComment: rep
        ? {
            id: rep.id,
            deleted: Boolean(rep.deletedAt),
            snippet: rep.deletedAt
              ? ''
              : (rep.content ?? '').slice(0, SNIPPET_LENGTH),
            author: toAuthor(rep.createdBy),
          }
        : null,
    };
  }

  private async publish(
    event: CatalogEvent,
    subject: CommentSubject,
    commentId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.eventBridge.publishSafely(
      event,
      {
        workspaceId,
        actor: { id: userId, type: AuditActorType.User },
        outcome: AuditOutcome.Success,
        resourceType: subject.kind,
        resourceId: subject.id,
        metadata: { commentId },
      } satisfies EventEnvelopeData,
      { subject: `workspace:${workspaceId}/${subject.kind}:${subject.id}` },
    );
  }
}
