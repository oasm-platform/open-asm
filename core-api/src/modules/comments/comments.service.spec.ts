import { IssueCommentType } from '@/common/enums/enum';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import type { Comment } from './entities/comment.entity';

const WS = 'ws-1';
const USER = 'user-1';
const ISSUE = 'issue-1';
const VULN = 'vuln-1';

/** A chainable query-builder mock whose terminal calls are given. */
function queryBuilder(terminal: Record<string, jest.Mock>) {
  const calls: Record<string, jest.Mock> = {};
  const proxy: Record<string, unknown> = new Proxy(calls, {
    get(target, prop: string) {
      if (prop === 'then') return undefined;
      if (prop in terminal) return terminal[prop];
      target[prop] ??= jest.fn(() => proxy);
      return target[prop];
    },
  });
  return { qb: proxy, calls };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    content: 'hello',
    type: IssueCommentType.CONTENT,
    issueId: ISSUE,
    vulnerabilityId: null,
    createdById: USER,
    createdBy: { id: USER, name: 'Ann', image: 'a.png', email: 'secret@x' },
    isCanEdit: true,
    isCanDelete: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as unknown as Comment;
}

function setup() {
  const loaded = comment();
  const list = queryBuilder({
    getManyAndCount: jest.fn().mockResolvedValue([[loaded], 1]),
    getOne: jest.fn().mockResolvedValue(loaded),
  });
  const commentsRepository = {
    createQueryBuilder: jest.fn(() => list.qb),
    findOne: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: object) => Promise.resolve({ id: 'c-new', ...x })),
    softDelete: jest.fn(),
  };
  const issuesRepository = {
    findOne: jest.fn().mockResolvedValue({ id: ISSUE }),
  };
  const vuln = queryBuilder({
    getOne: jest.fn().mockResolvedValue({ id: VULN }),
  });
  const vulnerabilitiesRepository = {
    createQueryBuilder: jest.fn(() => vuln.qb),
  };
  const eventBridge = { publishSafely: jest.fn() };
  const service = new CommentsService(
    commentsRepository as never,
    issuesRepository as never,
    vulnerabilitiesRepository as never,
    eventBridge as never,
  );
  return {
    service,
    commentsRepository,
    issuesRepository,
    vuln,
    list,
    eventBridge,
  };
}

describe('CommentsService', () => {
  describe('tenant checks', () => {
    it('looks the issue up inside the workspace and 404s otherwise', async () => {
      const { service, issuesRepository, commentsRepository } = setup();
      issuesRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({ kind: 'issue', id: ISSUE }, { content: 'x' }, USER, WS),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(issuesRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ISSUE, workspaceId: WS } }),
      );
      expect(commentsRepository.save).not.toHaveBeenCalled();
    });

    it('scopes a vulnerability through asset → target', async () => {
      const { service, vuln } = setup();
      await service.list(
        { kind: 'vulnerability', id: VULN },
        { page: 1, limit: 10 } as never,
        WS,
      );
      expect(vuln.calls.innerJoin).toHaveBeenCalledWith(
        'vulnerability.asset',
        'asset',
      );
      expect(vuln.calls.innerJoin).toHaveBeenCalledWith(
        'asset.target',
        'target',
      );
      expect(vuln.calls.andWhere).toHaveBeenCalledWith(
        'target.workspaceId = :workspaceId',
        { workspaceId: WS },
      );
    });

    it('404s a vulnerability of another workspace', async () => {
      const { service, vuln } = setup();
      (vuln.qb.getOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.list({ kind: 'vulnerability', id: VULN }, { page: 1, limit: 10 } as never, WS),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 for a comment whose subject is in another workspace', async () => {
      const { service, commentsRepository, issuesRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(comment());
      issuesRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update('c-1', { content: 'y' }, USER, WS),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('stores an issue comment and publishes issue.comment.created', async () => {
      const { service, commentsRepository, eventBridge } = setup();
      await service.create({ kind: 'issue', id: ISSUE }, { content: 'hi' }, USER, WS);
      expect(commentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'hi',
          issueId: ISSUE,
          createdById: USER,
          isCanEdit: true,
          isCanDelete: true,
        }),
      );
      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'issue.comment.created' }),
        expect.objectContaining({ workspaceId: WS, resourceId: ISSUE }),
        expect.anything(),
      );
    });

    it('stores a vulnerability comment and publishes vulnerability.comment.created', async () => {
      const { service, commentsRepository, eventBridge } = setup();
      await service.create(
        { kind: 'vulnerability', id: VULN },
        { content: 'hi' },
        USER,
        WS,
      );
      const saved = commentsRepository.save.mock.calls[0][0] as Comment;
      expect(saved.vulnerabilityId).toBe(VULN);
      expect(saved.issueId).toBeUndefined();
      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'vulnerability.comment.created' }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('accepts a reply to a comment of the same subject', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(comment({ id: 'parent' }));
      await service.create(
        { kind: 'issue', id: ISSUE },
        { content: 're', repCommentId: 'parent' },
        USER,
        WS,
      );
      expect(commentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ repCommentId: 'parent' }),
      );
    });

    it('refuses a reply to a comment of another subject', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(
        comment({ id: 'parent', issueId: 'other-issue' }),
      );
      await expect(
        service.create(
          { kind: 'issue', id: ISSUE },
          { content: 're', repCommentId: 'parent' },
          USER,
          WS,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(commentsRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a reply across subject kinds and to a missing comment', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValueOnce(
        comment({ id: 'parent', issueId: null, vulnerabilityId: ISSUE }),
      );
      await expect(
        service.create(
          { kind: 'issue', id: ISSUE },
          { content: 're', repCommentId: 'parent' },
          USER,
          WS,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      commentsRepository.findOne.mockResolvedValueOnce(null);
      await expect(
        service.create(
          { kind: 'issue', id: ISSUE },
          { content: 're', repCommentId: 'gone' },
          USER,
          WS,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update / delete', () => {
    it('lets the author edit and publishes issue.comment.updated', async () => {
      const { service, commentsRepository, eventBridge } = setup();
      commentsRepository.findOne.mockResolvedValue(comment());
      await service.update('c-1', { content: 'edited' }, USER, WS);
      expect(commentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'edited' }),
      );
      expect(eventBridge.publishSafely).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'issue.comment.updated' }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('refuses an edit by someone else', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(comment());
      await expect(
        service.update('c-1', { content: 'x' }, 'user-2', WS),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(commentsRepository.save).not.toHaveBeenCalled();
    });

    it('refuses to edit or delete a system comment, even by its author', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(
        comment({ isCanEdit: false, isCanDelete: false, type: IssueCommentType.SYSTEM }),
      );
      await expect(
        service.update('c-1', { content: 'x' }, USER, WS),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.delete('c-1', USER, WS)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(commentsRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the author’s comment', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(comment());
      await service.delete('c-1', USER, WS);
      expect(commentsRepository.softDelete).toHaveBeenCalledWith('c-1');
    });

    it('404s an unknown comment', async () => {
      const { service, commentsRepository } = setup();
      commentsRepository.findOne.mockResolvedValue(null);
      await expect(service.delete('nope', USER, WS)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('list / dto', () => {
    it('lists the subject’s comments oldest first', async () => {
      const { service, list } = setup();
      const result = await service.list(
        { kind: 'issue', id: ISSUE },
        { page: 2, limit: 5 } as never,
        WS,
      );
      expect(list.calls.andWhere).toHaveBeenCalledWith(
        'comment.issueId = :subjectId',
        { subjectId: ISSUE },
      );
      expect(list.calls.orderBy).toHaveBeenCalledWith('comment.createdAt', 'ASC');
      expect(list.calls.skip).toHaveBeenCalledWith(5);
      expect(result.total).toBe(1);
    });

    it('exposes authors as id/name/image only and marks deleted parents', () => {
      const { service } = setup();
      const dto = service.toDto(
        comment({
          repComment: {
            id: 'p',
            content: 'secret parent',
            deletedAt: new Date(),
            createdBy: { id: 'u2', name: 'Bob', image: null },
          } as unknown as Comment,
        }),
      );
      expect(dto.author).toEqual({ id: USER, name: 'Ann', image: 'a.png' });
      expect(dto.repComment).toEqual({
        id: 'p',
        deleted: true,
        snippet: '',
        author: { id: 'u2', name: 'Bob', image: null },
      });
    });

    it('shortens the replied-to content', () => {
      const { service } = setup();
      const dto = service.toDto(
        comment({
          repComment: { id: 'p', content: 'x'.repeat(500) } as unknown as Comment,
        }),
      );
      expect(dto.repComment?.snippet).toHaveLength(200);
      expect(dto.repComment?.author).toBeNull();
    });
  });
});
