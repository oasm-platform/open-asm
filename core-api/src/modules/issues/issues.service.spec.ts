import { SortOrder } from '@/common/dtos/get-many-base.dto';
import {
  IssueCommentType,
  IssueLinkResourceType,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
} from '@/common/enums/enum';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Issue } from './entities/issue.entity';
import { nextIssueNo } from './issue-activity';
import { IssuesService } from './issues.service';

const WS = 'ws-1';
const USER = 'user-1';
const LINK_A = { resourceType: IssueLinkResourceType.ASSET, resourceId: 'a-1' };
const LINK_V = {
  resourceType: IssueLinkResourceType.VULNERABILITY,
  resourceId: 'v-1',
};

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

const uniqueViolation = () =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('duplicate key'), { code: '23505' }),
  );

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'i-1',
    no: 7,
    title: 'SQLi',
    type: IssueType.VULNERABILITY_REMEDIATION,
    status: IssueStatus.OPEN,
    priority: IssuePriority.P2,
    resolution: null,
    resolvedAt: null,
    dueAt: null,
    assigneeId: null,
    workspaceId: WS,
    tags: [],
    links: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  } as Issue;
}

function setup() {
  const current = issue();
  const insert = queryBuilder({
    execute: jest.fn().mockResolvedValue({ raw: [{ id: 'l-1' }] }),
  });
  const commentRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn(),
  };
  const manager = {
    query: jest.fn((sql: string) =>
      Promise.resolve(sql.includes('issue_counters') ? [{ lastNo: 8 }] : []),
    ),
    create: jest.fn((_: unknown, data: object) => data),
    save: jest.fn((x: object) => Promise.resolve({ id: 'i-new', ...x })),
    getRepository: jest.fn(() => commentRepo),
    createQueryBuilder: jest.fn(() => insert.qb),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
    // Membership check: a row means "is a member".
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const list = queryBuilder({
    getManyAndCount: jest.fn().mockResolvedValue([[current], 1]),
  });
  const issuesRepository = {
    findOne: jest.fn().mockResolvedValue(current),
    createQueryBuilder: jest.fn(() => list.qb),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    delete: jest.fn(),
  };
  const linksRepository = { findOne: jest.fn(), delete: jest.fn() };
  const links = {
    assertInWorkspace: jest.fn(),
    summarize: jest.fn((l: unknown[]) => Promise.resolve(l.map(() => ({ value: 'x' })))),
  };
  const handlers = {
    progress: jest.fn((issues: { id: string }[]) =>
      Promise.resolve(new Map(issues.map((i) => [i.id, { done: 1, total: 2 }]))),
    ),
    get: jest.fn(() => ({
      progress: (ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, { done: 1, total: 2 }]))),
    })),
  };
  const events = { publish: jest.fn() };
  const service = new IssuesService(
    issuesRepository as never,
    linksRepository as never,
    dataSource as never,
    links as never,
    handlers as never,
    events as never,
  );
  return {
    service,
    current,
    manager,
    dataSource,
    insert,
    list,
    issuesRepository,
    linksRepository,
    links,
    events,
    commentRepo,
  };
}

const published = (events: { publish: jest.Mock }) =>
  events.publish.mock.calls.map((c: [{ name: string }]) => c[0].name);

describe('IssuesService', () => {
  describe('numbering', () => {
    it('bumps the workspace counter in one upsert', async () => {
      const manager = {
        query: jest.fn().mockResolvedValueOnce([{ lastNo: '13' }]),
      };
      await expect(nextIssueNo(manager as never, WS)).resolves.toBe(13);
      expect(manager.query).toHaveBeenCalledTimes(1);
      const [sql, params] = manager.query.mock.calls[0] as [string, string[]];
      expect(sql).toContain('INSERT INTO "issue_counters"');
      expect(sql).toContain('ON CONFLICT ("workspaceId")');
      expect(sql).toContain('RETURNING "lastNo"');
      expect(params).toEqual([WS]);
    });

    it('numbers a new issue inside the transaction and links its resources', async () => {
      const { service, manager, insert, events, links } = setup();
      await service.createIssue(
        { title: 'Patch', links: [LINK_A, LINK_A, LINK_V] },
        WS,
        USER,
      );
      expect(links.assertInWorkspace).toHaveBeenCalledWith([LINK_A, LINK_V], WS);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          no: 8,
          type: IssueType.TASK,
          priority: IssuePriority.P3,
          status: IssueStatus.OPEN,
          workspaceId: WS,
          createdById: USER,
        }),
      );
      expect(insert.calls.values).toHaveBeenCalledWith([
        expect.objectContaining({ issueId: 'i-new', ...LINK_A, addedById: USER }),
        expect.objectContaining({ issueId: 'i-new', ...LINK_V, addedById: USER }),
      ]);
      expect(insert.calls.orIgnore).toHaveBeenCalled();
      expect(published(events)).toEqual(['issue.created']);
    });

    it('refuses links to resources outside the workspace before writing', async () => {
      const { service, links, dataSource } = setup();
      links.assertInWorkspace.mockRejectedValue(new NotFoundException());
      await expect(
        service.createIssue({ title: 'x', links: [LINK_V] }, WS, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses an assignee who is not a member', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockResolvedValue([]);
      await expect(
        service.createIssue({ title: 'x', assigneeId: 'stranger' }, WS, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getMany', () => {
    it('applies every filter and returns progress, link count and assignee', async () => {
      const { service, list, current } = setup();
      Object.assign(current, {
        linkCount: 3,
        assignee: { id: 'u2', name: 'Bob', image: null, email: 'hidden' },
      });
      const result = await service.getMany(
        {
          page: 1,
          limit: 10,
          status: [IssueStatus.OPEN],
          type: [IssueType.TASK],
          priority: [IssuePriority.P1],
          assigneeId: 'u2',
          mine: true,
          overdue: true,
          resourceType: IssueLinkResourceType.VULNERABILITY,
          resourceId: 'v-1',
          search: '#12',
          sortBy: 'dueAt',
          sortOrder: SortOrder.ASC,
        },
        WS,
        USER,
      );
      const where = list.calls.andWhere.mock.calls.map((c: unknown[]) => c[0]);
      expect(list.calls.where).toHaveBeenCalledWith(
        'issue.workspaceId = :workspaceId',
        { workspaceId: WS },
      );
      expect(where).toEqual(
        expect.arrayContaining([
          'issue.status IN (:...status)',
          'issue.type IN (:...type)',
          'issue.priority IN (:...priority)',
          'issue.assigneeId = :assigneeId',
          'issue.assigneeId = :me',
          'issue.dueAt < now()',
          'issue.status IN (:...active)',
          expect.stringContaining('"issue_links" rl'),
        ]),
      );
      expect(list.calls.orderBy).toHaveBeenCalledWith('issue.dueAt', 'ASC', 'NULLS LAST');
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          linkCount: 3,
          progress: { done: 1, total: 2 },
          assignee: { id: 'u2', name: 'Bob', image: null },
        }),
      );
    });

    it('falls back to updatedAt DESC for an unknown sort column', async () => {
      const { service, list } = setup();
      await service.getMany(
        { page: 1, limit: 10, sortBy: 'title', sortOrder: undefined },
        WS,
      );
      expect(list.calls.orderBy).toHaveBeenCalledWith(
        'issue.updatedAt',
        'DESC',
        'NULLS LAST',
      );
    });

    it('needs resourceType and resourceId together', async () => {
      const { service } = setup();
      await expect(
        service.getMany({ page: 1, limit: 10, resourceId: 'v-1' } as never, WS),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getById', () => {
    it('404s outside the workspace', async () => {
      const { service, issuesRepository } = setup();
      issuesRepository.findOne.mockResolvedValue(null);
      await expect(service.getById('i-1', 'ws-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(issuesRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'i-1', workspaceId: 'ws-2' } }),
      );
    });

    it('summarises every link', async () => {
      const { service, current } = setup();
      current.links = [
        { id: 'l-1', ...LINK_V, createdAt: new Date() },
      ] as Issue['links'];
      const detail = await service.getById('i-1', WS);
      expect(detail.links).toEqual([
        expect.objectContaining({ id: 'l-1', ...LINK_V, resource: { value: 'x' } }),
      ]);
      expect(detail.progress).toEqual({ done: 1, total: 2 });
    });
  });

  describe('update', () => {
    it('lets any member change fields and publishes updated + assigned', async () => {
      const { service, issuesRepository, events, current } = setup();
      current.createdById = 'someone-else';
      await service.update(
        'i-1',
        { title: 'New', priority: IssuePriority.P1, assigneeId: 'u2' },
        USER,
        WS,
      );
      expect(issuesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New',
          priority: IssuePriority.P1,
          assigneeId: 'u2',
        }),
      );
      expect(published(events)).toEqual(['issue.updated', 'issue.assigned']);
    });

    it('refuses an assignee outside the workspace', async () => {
      const { service, dataSource, issuesRepository } = setup();
      dataSource.query.mockResolvedValue([]);
      await expect(
        service.update('i-1', { assigneeId: 'stranger' }, USER, WS),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(issuesRepository.save).not.toHaveBeenCalled();
    });

    it('does nothing when nothing changes', async () => {
      const { service, issuesRepository, events } = setup();
      await service.update('i-1', { title: 'SQLi' }, USER, WS);
      expect(issuesRepository.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('needs a resolution to resolve or close', async () => {
      const { service } = setup();
      await expect(
        service.changeStatus('i-1', { status: IssueStatus.RESOLVED }, USER, WS),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.changeStatus('i-1', { status: IssueStatus.CLOSED }, USER, WS),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves with a resolution, a system comment and issue.resolved', async () => {
      const { service, manager, commentRepo, events } = setup();
      await service.changeStatus(
        'i-1',
        { status: IssueStatus.RESOLVED, resolution: IssueResolution.FIXED },
        USER,
        WS,
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IssueStatus.RESOLVED,
          resolution: IssueResolution.FIXED,
          resolvedAt: expect.any(Date),
        }),
      );
      expect(commentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: 'i-1',
          type: IssueCommentType.CLOSED,
          createdById: USER,
          isCanEdit: false,
          isCanDelete: false,
          content: expect.stringContaining('open to resolved (fixed)'),
        }),
      );
      expect(published(events)).toEqual(['issue.resolved']);
    });

    it('reopening clears the resolution and publishes issue.opened', async () => {
      const { service, manager, events, current } = setup();
      Object.assign(current, {
        status: IssueStatus.CLOSED,
        resolution: IssueResolution.WONT_FIX,
        resolvedAt: new Date(),
      });
      await service.changeStatus('i-1', { status: IssueStatus.OPEN }, USER, WS);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IssueStatus.OPEN,
          resolution: null,
          resolvedAt: null,
        }),
      );
      expect(published(events)).toEqual(['issue.opened']);
    });

    it('moving to in progress publishes issue.updated', async () => {
      const { service, events } = setup();
      await service.changeStatus('i-1', { status: IssueStatus.IN_PROGRESS }, USER, WS);
      expect(published(events)).toEqual(['issue.updated']);
    });

    it('is a no-op for the current status', async () => {
      const { service, dataSource, events } = setup();
      await service.changeStatus('i-1', { status: IssueStatus.OPEN }, USER, WS);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('reports a reopen that collides with another open issue of the group', async () => {
      const { service, dataSource, events, current } = setup();
      Object.assign(current, {
        status: IssueStatus.RESOLVED,
        resolution: IssueResolution.FIXED,
        groupKey: 'vuln:sqli',
      });
      dataSource.transaction.mockRejectedValue(uniqueViolation());
      await expect(
        service.changeStatus('i-1', { status: IssueStatus.OPEN }, USER, WS),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  describe('links', () => {
    it('validates, de-duplicates and publishes issue.link.added', async () => {
      const { service, links, insert, events } = setup();
      await service.addLinks('i-1', { links: [LINK_V, LINK_V] }, USER, WS);
      expect(links.assertInWorkspace).toHaveBeenCalledWith([LINK_V], WS);
      expect(insert.calls.values).toHaveBeenCalledWith([
        expect.objectContaining(LINK_V),
      ]);
      expect(published(events)).toEqual(['issue.link.added']);
    });

    it('publishes nothing when every link already existed', async () => {
      const { service, insert, events } = setup();
      (insert.qb.execute as jest.Mock).mockResolvedValue({ raw: [] });
      await service.addLinks('i-1', { links: [LINK_V] }, USER, WS);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('removes a link of the issue only', async () => {
      const { service, linksRepository, events } = setup();
      linksRepository.findOne.mockResolvedValue(null);
      await expect(
        service.removeLink('i-1', 'l-x', USER, WS),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(linksRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'l-x', issueId: 'i-1' },
      });

      linksRepository.findOne.mockResolvedValue({ id: 'l-1', ...LINK_V });
      await service.removeLink('i-1', 'l-1', USER, WS);
      expect(linksRepository.delete).toHaveBeenCalledWith({ id: 'l-1' });
      expect(published(events)).toEqual(['issue.link.removed']);
    });
  });

  it('deletes an issue of the workspace and publishes issue.deleted', async () => {
    const { service, issuesRepository, events } = setup();
    await service.delete('i-1', USER, WS);
    expect(issuesRepository.delete).toHaveBeenCalledWith({ id: 'i-1' });
    expect(published(events)).toEqual(['issue.deleted']);
  });
});
