import {
  type GetManyBaseResponseDto,
  SortOrder,
} from '@/common/dtos/get-many-base.dto';
import {
  IssueCommentType,
  IssuePriority,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import type { EventEnvelopeData } from '@/modules/event-bridge/contracts/event-envelope';
import { getManyResponse } from '@/utils/getManyResponse';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import {
  type GetManyIssuesDto,
  ISSUE_SORT_FIELDS,
  type IssueSortField,
} from './dto/get-many-issues.dto';
import type { AddIssueLinksDto, IssueLinkDto } from './dto/issue-link.dto';
import type {
  ChangeIssueStatusDto,
  CreateIssueDto,
  IssueDetailDto,
  IssueListItemDto,
  IssueProgressDto,
  IssueUserDto,
  UpdateIssueDto,
} from './dto/issue.dto';
import { IssueLink } from './entities/issue-link.entity';
import { Issue } from './entities/issue.entity';
import { IssueTypeHandlerRegistry } from './handlers/issue-type-handler.registry';
import {
  ACTIVE_ISSUE_STATUSES,
  assertWorkspaceMember,
  insertLinks,
  isActiveStatus,
  IssueEventsPublisher,
  isUniqueViolation,
  nextIssueNo,
  uniqueLinks,
  writeSystemComment,
} from './issue-activity';
import { IssueLinksService } from './issue-links.service';

const toUser = (
  user: { id: string; name: string; image?: string | null } | null | undefined,
): IssueUserDto | null =>
  user ? { id: user.id, name: user.name, image: user.image ?? null } : null;

const isFinal = (status: IssueStatus): boolean =>
  status === IssueStatus.RESOLVED || status === IssueStatus.CLOSED;

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const sameDate = (a?: Date | null, b?: Date | null): boolean =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

/**
 * Issues: generic work items. The core (status, priority, assignee, due date,
 * links, numbering) is the same for every type; progress and automation come
 * from the type's handler.
 *
 * Any workspace member with write permission may edit, assign and move an
 * issue — the controller's guard is the permission check, not authorship.
 */
@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issuesRepository: Repository<Issue>,
    @InjectRepository(IssueLink)
    private readonly linksRepository: Repository<IssueLink>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly links: IssueLinksService,
    private readonly handlers: IssueTypeHandlerRegistry,
    private readonly events: IssueEventsPublisher,
  ) {}

  async createIssue(
    dto: CreateIssueDto,
    workspaceId: string,
    userId: string,
  ): Promise<IssueDetailDto> {
    if (dto.assigneeId) {
      await assertWorkspaceMember(this.dataSource, workspaceId, dto.assigneeId);
    }
    const links = uniqueLinks(dto.links ?? []);
    await this.links.assertInWorkspace(links, workspaceId);

    const issue = await this.dataSource.transaction(async (manager) => {
      const no = await nextIssueNo(manager, workspaceId);
      const saved = await manager.save(
        manager.create(Issue, {
          title: dto.title,
          description: dto.description,
          type: dto.type ?? IssueType.TASK,
          priority: dto.priority ?? IssuePriority.P3,
          status: IssueStatus.OPEN,
          dueAt: dto.dueAt ?? null,
          assigneeId: dto.assigneeId ?? null,
          tags: dto.tags,
          workspaceId,
          createdById: userId,
          no,
        }),
      );
      await insertLinks(manager, saved.id, links, userId);
      return saved;
    });

    await this.events.publish(
      EVENT_CATALOG.issue.created,
      issue,
      { userId },
      {
        linkCount: links.length,
        ...(issue.assigneeId ? { assigneeId: issue.assigneeId } : {}),
      },
    );
    return this.getById(issue.id, workspaceId);
  }

  async getMany(
    query: GetManyIssuesDto,
    workspaceId: string,
    userId?: string,
  ): Promise<GetManyBaseResponseDto<IssueListItemDto>> {
    const { page, limit } = query;
    const qb = this.issuesRepository
      .createQueryBuilder('issue')
      .leftJoin('issue.assignee', 'assignee')
      .leftJoin('issue.createdBy', 'createdBy')
      .addSelect([
        'assignee.id',
        'assignee.name',
        'assignee.image',
        'createdBy.id',
        'createdBy.name',
        'createdBy.image',
      ])
      .loadRelationCountAndMap('issue.linkCount', 'issue.links')
      .where('issue.workspaceId = :workspaceId', { workspaceId });

    if (query.status?.length) {
      qb.andWhere('issue.status IN (:...status)', { status: query.status });
    }
    if (query.type?.length) {
      qb.andWhere('issue.type IN (:...type)', { type: query.type });
    }
    if (query.priority?.length) {
      qb.andWhere('issue.priority IN (:...priority)', {
        priority: query.priority,
      });
    }
    if (query.assigneeId) {
      qb.andWhere('issue.assigneeId = :assigneeId', {
        assigneeId: query.assigneeId,
      });
    }
    if (query.mine) {
      if (!userId) throw new BadRequestException('"mine" needs a user');
      qb.andWhere('issue.assigneeId = :me', { me: userId });
    }
    if (query.overdue) {
      qb.andWhere('issue.dueAt < now()').andWhere(
        'issue.status IN (:...active)',
        { active: ACTIVE_ISSUE_STATUSES },
      );
    }
    if (query.resourceType || query.resourceId) {
      if (!query.resourceType || !query.resourceId) {
        throw new BadRequestException(
          'resourceType and resourceId must be given together',
        );
      }
      qb.andWhere(
        `EXISTS (SELECT 1 FROM "issue_links" rl
                  WHERE rl."issueId" = issue.id
                    AND rl."resourceType" = :resourceType
                    AND rl."resourceId" = :resourceId)`,
        { resourceType: query.resourceType, resourceId: query.resourceId },
      );
    }
    const term = query.search?.trim();
    if (term) {
      const number = /^#?(\d{1,9})$/.exec(term);
      qb.andWhere(
        new Brackets((where) => {
          where.where('issue.title ILIKE :search', {
            search: `%${escapeLike(term)}%`,
          });
          if (number) where.orWhere('issue.no = :no', { no: Number(number[1]) });
        }),
      );
    }

    const sortBy: IssueSortField = (
      ISSUE_SORT_FIELDS as readonly string[]
    ).includes(query.sortBy)
      ? (query.sortBy as IssueSortField)
      : 'updatedAt';
    const order = query.sortOrder ?? SortOrder.DESC;
    qb.orderBy(`issue.${sortBy}`, order, 'NULLS LAST')
      .addOrderBy('issue.no', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [issues, total] = await qb.getManyAndCount();
    const progress = await this.handlers.progress(issues);
    return getManyResponse({
      query,
      data: issues.map((issue) =>
        this.toListItem(issue, progress.get(issue.id) ?? null),
      ),
      total,
    });
  }

  /** The issue with resolved links and progress. */
  async getById(id: string, workspaceId: string): Promise<IssueDetailDto> {
    const issue = await this.issuesRepository.findOne({
      where: { id, workspaceId },
      relations: { assignee: true, createdBy: true, links: true },
    });
    if (!issue) throw new NotFoundException(`Issue with ID ${id} not found`);

    const links = [...(issue.links ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const [summaries, progress] = await Promise.all([
      this.links.summarize(links, workspaceId),
      this.handlers.get(issue.type).progress([issue.id]),
    ]);
    const linkDtos: IssueLinkDto[] = links.map((link, index) => ({
      id: link.id,
      resourceType: link.resourceType,
      resourceId: link.resourceId,
      addedById: link.addedById ?? null,
      createdAt: link.createdAt,
      resource: summaries[index],
    }));
    return {
      ...this.toListItem(
        Object.assign(issue, { linkCount: links.length }),
        progress.get(issue.id) ?? null,
      ),
      description: issue.description ?? null,
      groupKey: issue.groupKey ?? null,
      links: linkDtos,
    };
  }

  async update(
    id: string,
    dto: UpdateIssueDto,
    userId: string,
    workspaceId: string,
  ): Promise<IssueDetailDto> {
    const issue = await this.findInWorkspace(id, workspaceId);
    const changes: NonNullable<EventEnvelopeData['changes']> = {};
    const set = <K extends 'title' | 'description' | 'priority'>(
      key: K,
      value: Issue[K] | undefined,
    ) => {
      if (value === undefined || value === issue[key]) return;
      changes[key] = { before: issue[key], after: value };
      issue[key] = value;
    };
    set('title', dto.title);
    // A null description clears it (stored as empty text).
    if (dto.description !== undefined) set('description', dto.description ?? '');
    set('priority', dto.priority);
    if (dto.tags !== undefined) {
      changes.tags = { before: issue.tags ?? [], after: dto.tags };
      issue.tags = dto.tags;
    }
    if (dto.dueAt !== undefined && !sameDate(dto.dueAt, issue.dueAt)) {
      changes.dueAt = { before: issue.dueAt ?? null, after: dto.dueAt };
      issue.dueAt = dto.dueAt;
    }
    const assigneeChanged =
      dto.assigneeId !== undefined &&
      (dto.assigneeId ?? null) !== (issue.assigneeId ?? null);
    if (assigneeChanged) {
      if (dto.assigneeId) {
        await assertWorkspaceMember(this.dataSource, workspaceId, dto.assigneeId);
      }
      changes.assigneeId = {
        before: issue.assigneeId ?? null,
        after: dto.assigneeId ?? null,
      };
      issue.assigneeId = dto.assigneeId ?? null;
    }
    if (Object.keys(changes).length === 0) {
      return this.getById(id, workspaceId);
    }

    await this.issuesRepository.save(issue);
    await this.events.publish(
      EVENT_CATALOG.issue.updated,
      issue,
      { userId },
      { fields: Object.keys(changes) },
      changes,
    );
    if (assigneeChanged) {
      await this.events.publish(
        EVENT_CATALOG.issue.assigned,
        issue,
        { userId },
        issue.assigneeId ? { assigneeId: issue.assigneeId } : {},
      );
    }
    return this.getById(id, workspaceId);
  }

  /**
   * Moves an issue. Resolving or closing needs a resolution; going back to
   * open / in progress clears it. Every change leaves a system comment.
   */
  async changeStatus(
    id: string,
    dto: ChangeIssueStatusDto,
    userId: string,
    workspaceId: string,
  ): Promise<IssueDetailDto> {
    const issue = await this.findInWorkspace(id, workspaceId);
    const closing = isFinal(dto.status);
    if (closing && !dto.resolution) {
      throw new BadRequestException(
        `A resolution is required to mark an issue ${dto.status}`,
      );
    }
    const resolution = closing ? (dto.resolution ?? null) : null;
    const before = issue.status;
    if (before === dto.status && (issue.resolution ?? null) === resolution) {
      return this.getById(id, workspaceId);
    }

    issue.status = dto.status;
    issue.resolution = resolution;
    issue.resolvedAt = closing
      ? isFinal(before) && issue.resolvedAt
        ? issue.resolvedAt
        : new Date()
      : null;

    const text = `Status changed from ${before} to ${dto.status}${
      resolution ? ` (${resolution})` : ''
    }${dto.note ? `: ${dto.note}` : ''}`;
    const commentType = closing
      ? IssueCommentType.CLOSED
      : dto.status === IssueStatus.OPEN
        ? IssueCommentType.OPEN
        : IssueCommentType.SYSTEM;

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(issue);
        await writeSystemComment(manager, issue.id, text, commentType, userId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Another open issue already tracks the same group; link its resources there instead',
        );
      }
      throw error;
    }

    const event =
      dto.status === IssueStatus.RESOLVED
        ? EVENT_CATALOG.issue.resolved
        : dto.status === IssueStatus.CLOSED
          ? EVENT_CATALOG.issue.closed
          : isFinal(before) && isActiveStatus(dto.status)
            ? EVENT_CATALOG.issue.opened
            : EVENT_CATALOG.issue.updated;
    await this.events.publish(
      event,
      issue,
      { userId },
      resolution ? { resolution } : {},
      { status: { before, after: dto.status } },
    );
    return this.getById(id, workspaceId);
  }

  async addLinks(
    id: string,
    dto: AddIssueLinksDto,
    userId: string,
    workspaceId: string,
  ): Promise<IssueDetailDto> {
    const issue = await this.findInWorkspace(id, workspaceId);
    const links = uniqueLinks(dto.links);
    await this.links.assertInWorkspace(links, workspaceId);
    const added = await this.dataSource.transaction((manager) =>
      insertLinks(manager, issue.id, links, userId),
    );
    if (added > 0) {
      await this.events.publish(
        EVENT_CATALOG.issue.link.added,
        issue,
        { userId },
        {
          count: added,
          resourceTypes: [...new Set(links.map((l) => l.resourceType))],
        },
      );
    }
    return this.getById(id, workspaceId);
  }

  async removeLink(
    id: string,
    linkId: string,
    userId: string,
    workspaceId: string,
  ): Promise<IssueDetailDto> {
    const issue = await this.findInWorkspace(id, workspaceId);
    const link = await this.linksRepository.findOne({
      where: { id: linkId, issueId: issue.id },
    });
    if (!link) throw new NotFoundException(`Link with ID ${linkId} not found`);
    await this.linksRepository.delete({ id: link.id });
    await this.events.publish(
      EVENT_CATALOG.issue.link.removed,
      issue,
      { userId },
      { resourceType: link.resourceType, resourceId: link.resourceId },
    );
    return this.getById(id, workspaceId);
  }

  async delete(
    id: string,
    userId: string,
    workspaceId: string,
  ): Promise<{ message: string }> {
    const issue = await this.findInWorkspace(id, workspaceId);
    await this.issuesRepository.delete({ id: issue.id });
    await this.events.publish(EVENT_CATALOG.issue.deleted, issue, { userId });
    return { message: 'Issue deleted successfully' };
  }

  /** The issue entity, 404 unless it is in `workspaceId`. */
  async findInWorkspace(id: string, workspaceId: string): Promise<Issue> {
    const issue = await this.issuesRepository.findOne({
      where: { id, workspaceId },
    });
    if (!issue) throw new NotFoundException(`Issue with ID ${id} not found`);
    return issue;
  }

  private toListItem(
    issue: Issue & { linkCount?: number },
    progress: IssueProgressDto | null,
  ): IssueListItemDto {
    return {
      id: issue.id,
      no: issue.no,
      title: issue.title,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      resolution: issue.resolution ?? null,
      dueAt: issue.dueAt ?? null,
      resolvedAt: issue.resolvedAt ?? null,
      tags: issue.tags ?? [],
      ruleId: issue.ruleId ?? null,
      assignee: toUser(issue.assignee),
      createdBy: toUser(issue.createdBy),
      linkCount: issue.linkCount ?? 0,
      progress,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
