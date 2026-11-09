import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DataSource, Repository } from 'typeorm';
import {
  DismissReason,
  Severity,
  VulnerabilityAnalyzeStatus,
  VulnerabilityDiscoveredBy,
} from '@/common/enums/enum';
import type { AgentsCompletionsService } from '../agents/agents.completions';
import type { User } from '../auth/entities/user.entity';
import type { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import type { WorkflowRunnerService } from '../jobs-registry/workflow-runner.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { Target } from '../targets/entities/target.entity';
import type { ToolsService } from '../tools/tools.service';
import type { WorkflowsService } from '../workflows/workflows.service';
import { VulnerabilityStatus } from './dto/get-vulnerability.dto';
import type { GetVulnerabilitiesQueryDto } from './dto/get-vulnerability.dto';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';
import { VulnerabilityEvent } from './entities/vulnerability-event.entity';
import { Vulnerability } from './entities/vulnerability.entity';
import { openVulnerabilityCondition } from './open-vulnerability';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityProvenance } from '../projects/provenance';
import { vulnerabilityStatusCondition } from './vulnerability-status';

const WS = 'ws-1';
const user = { id: 'u-1', name: 'Ana', email: 'ana@x.io' } as User;
const DAY = 86_400_000;

/** A chainable query builder whose terminal calls are jest mocks. */
function queryBuilder(result: { many?: unknown[]; total?: number; one?: unknown }) {
  const qb: Record<string, jest.Mock> = {};
  for (const name of [
    'leftJoin',
    'leftJoinAndSelect',
    'addSelect',
    'where',
    'andWhere',
    'skip',
    'take',
    'orderBy',
  ]) {
    qb[name] = jest.fn(() => qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([result.many ?? [], result.total ?? 0]);
  qb.getOne = jest.fn().mockResolvedValue(result.one);
  return qb;
}

function setup() {
  const vulnRepo = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const dismissRepo = { find: jest.fn().mockResolvedValue([]) };
  const manager = {
    insert: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((_entity: unknown, value: unknown) => Promise.resolve(value)),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => Promise.resolve(cb(manager))),
  };
  const service = new VulnerabilitiesService(
    vulnRepo as unknown as Repository<Vulnerability>,
    dismissRepo as unknown as Repository<VulnerabilityDismissal>,
    {} as Queue,
    {} as JobsRegistryService,
    {} as ToolsService,
    {} as WorkflowsService,
    {} as AgentsCompletionsService,
    {} as NotificationsService,
    {} as Repository<Target>,
    {} as WorkflowRunnerService,
    dataSource as unknown as DataSource,
  );
  return { service, vulnRepo, dismissRepo, manager, dataSource };
}

const eventsOf = (manager: { insert: jest.Mock }) =>
  manager.insert.mock.calls
    .filter(([target]) => target === VulnerabilityEvent)
    .flatMap(([, rows]) => rows as Array<Record<string, unknown>>);

const listQuery = (overrides: Partial<GetVulnerabilitiesQueryDto> = {}) =>
  ({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC', ...overrides }) as GetVulnerabilitiesQueryDto;

describe('vulnerabilityStatusCondition', () => {
  it('defaults to the open condition', () => {
    expect(vulnerabilityStatusCondition(undefined, 'v')).toBe(openVulnerabilityCondition('v'));
  });

  it.each([
    [VulnerabilityStatus.NEW, `v."detectionStatus" = 'new'`],
    [VulnerabilityStatus.ACTIVE, `v."detectionStatus" = 'active'`],
    [VulnerabilityStatus.RESURFACED, `v."detectionStatus" = 'resurfaced'`],
    [VulnerabilityStatus.FIXED, `v."detectionStatus" = 'fixed'`],
    [VulnerabilityStatus.DISMISSED, `st_vd."expiresAt" > now()`],
    [VulnerabilityStatus.ALL, `v."reviewStatus" = 'approved'`],
  ])('%s implies an approved finding', (status, fragment) => {
    const sql = vulnerabilityStatusCondition(status, 'v');
    expect(sql).toContain(`v."reviewStatus" = 'approved'`);
    expect(sql).toContain(fragment);
  });

  it.each([
    [VulnerabilityStatus.PENDING_REVIEW, 'pending_review'],
    [VulnerabilityStatus.REJECTED, 'rejected'],
  ])('%s lists AI proposals', (status, review) => {
    expect(vulnerabilityStatusCondition(status, 'v')).toBe(`v."reviewStatus" = '${review}'`);
  });

  it('keeps new/active/resurfaced to open (not dismissed) findings', () => {
    expect(vulnerabilityStatusCondition(VulnerabilityStatus.NEW, 'v')).toContain(
      openVulnerabilityCondition('v'),
    );
  });
});

describe('VulnerabilitiesService lifecycle API', () => {
  describe('getVulnerabilities', () => {
    it('lists open findings by default with sources, dismissal and open issue', async () => {
      const { service, vulnRepo, dataSource } = setup();
      const row = {
        id: 'v-1',
        name: 'XSS',
        vulnerabilityDismissal: {
          reason: DismissReason.RISK_ACCEPTED,
          comment: 'later',
          expiresAt: new Date('2027-01-01'),
          createdAt: new Date('2026-11-01'),
          user: { id: 'u-2', name: 'Bo', image: null, email: 'bo@x.io' },
        },
      };
      const qb = queryBuilder({ many: [row], total: 1 });
      vulnRepo.createQueryBuilder.mockReturnValue(qb);
      dataSource.query
        .mockResolvedValueOnce([
          { vulnerabilityId: 'v-1', kind: 'tool', toolName: 'nuclei', agentName: null },
          { vulnerabilityId: 'v-1', kind: 'ai_agent', toolName: null, agentName: 'pentest' },
        ])
        .mockResolvedValueOnce([{ resourceId: 'v-1', id: 'i-1', no: 7, status: 'in_progress' }]);

      const result = await service.getVulnerabilities(listQuery(), WS);

      expect(qb.where).toHaveBeenCalledWith('targets.workspaceId = :workspaceId', { workspaceId: WS });
      expect(qb.andWhere).toHaveBeenCalledWith(openVulnerabilityCondition('vulnerabilities'));
      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        id: 'v-1',
        sources: [
          { kind: 'tool', toolName: 'nuclei', agentName: null },
          { kind: 'ai_agent', toolName: null, agentName: 'pentest' },
        ],
        openIssue: { id: 'i-1', no: 7, status: 'in_progress' },
        dismissal: {
          reason: DismissReason.RISK_ACCEPTED,
          expiresAt: new Date('2027-01-01'),
          user: { id: 'u-2', name: 'Bo', image: null },
        },
      });
      // Users only as id/name/image
      expect(JSON.stringify(result.data[0].dismissal)).not.toContain('bo@x.io');
      const issueSql = dataSource.query.mock.calls[1][0] as string;
      expect(issueSql).toContain(`i.status IN ('open', 'in_progress', 'resolved')`);
      expect(issueSql).toContain('DISTINCT ON (l."resourceId")');
    });

    it('applies review statuses, overdue, discoveredBy, first-detection range and nulls-last sort', async () => {
      const { service, vulnRepo } = setup();
      const qb = queryBuilder({});
      vulnRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getVulnerabilities(
        listQuery({
          status: VulnerabilityStatus.PENDING_REVIEW,
          overdue: true,
          discoveredBy: [VulnerabilityDiscoveredBy.AI],
          createdFrom: '2026-01-01',
          createdTo: '2026-01-31',
          sortBy: 'dueAt',
        }),
        WS,
      );

      const conditions = qb.andWhere.mock.calls.map((c) => c[0] as string);
      expect(conditions).toContain(`vulnerabilities."reviewStatus" = 'pending_review'`);
      expect(conditions).toContain('vulnerabilities.dueAt < now()');
      expect(conditions).toContain('vulnerabilities.discoveredBy IN (:...discoveredBy)');
      expect(conditions).toContain('vulnerabilities.firstDetectedDate >= :createdFrom');
      expect(conditions).toContain('vulnerabilities.firstDetectedDate <= :createdTo');
      expect(qb.orderBy).toHaveBeenCalledWith('vulnerabilities.dueAt', 'DESC', 'NULLS LAST');
    });

    it('narrows to a project, its provenance and run, and adds each sighting', async () => {
      const { service, vulnRepo, dataSource } = setup();
      const qb = queryBuilder({ many: [{ id: 'v-1', name: 'XSS' }], total: 1 });
      vulnRepo.createQueryBuilder.mockReturnValue(qb);
      const first = new Date('2026-11-01');
      const last = new Date('2026-11-05');
      dataSource.query.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('pv."timesSeen"')
            ? [
                {
                  id: 'v-1',
                  timesSeen: 3,
                  firstSeenJobHistoryId: 'run-1',
                  firstSeenAt: first,
                  lastSeenJobHistoryId: 'run-3',
                  lastSeenAt: last,
                  provenance: VulnerabilityProvenance.RECURRING,
                },
              ]
            : [],
        ),
      );

      const result = await service.getVulnerabilities(
        listQuery({
          projectId: 'p-1',
          provenance: VulnerabilityProvenance.RECURRING,
          jobHistoryId: 'run-3',
        }),
        WS,
      );

      const projectCall = qb.andWhere.mock.calls.find(([sql]) =>
        String(sql).includes('project_vulnerabilities'),
      ) as [string, Record<string, unknown>];
      expect(projectCall[0]).toContain('pv."projectId" = :projectId');
      expect(projectCall[0]).toContain(') = :provenance');
      expect(projectCall[0]).toContain('pv."lastSeenJobHistoryId" = :jobHistoryId');
      expect(projectCall[1]).toEqual({
        projectId: 'p-1',
        provenance: VulnerabilityProvenance.RECURRING,
        jobHistoryId: 'run-3',
      });
      expect(result.data[0].projectSighting).toEqual({
        provenance: VulnerabilityProvenance.RECURRING,
        timesSeen: 3,
        firstSeen: { runId: 'run-1', at: first },
        lastSeen: { runId: 'run-3', at: last },
      });
    });

    it('leaves rows without a project sighting outside a project', async () => {
      const { service, vulnRepo } = setup();
      const qb = queryBuilder({ many: [{ id: 'v-1' }], total: 1 });
      vulnRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getVulnerabilities(listQuery(), WS);

      expect(result.data[0]).not.toHaveProperty('projectSighting');
      expect(
        qb.andWhere.mock.calls.some(([sql]) => String(sql).includes('project_vulnerabilities')),
      ).toBe(false);
    });

    it('skips the enrichment queries on an empty page', async () => {
      const { service, vulnRepo, dataSource } = setup();
      vulnRepo.createQueryBuilder.mockReturnValue(queryBuilder({}));

      await service.getVulnerabilities(listQuery({ sortBy: 'timesDetected' }), WS);

      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('getVulnerability', () => {
    it('404s outside the workspace', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.createQueryBuilder.mockReturnValue(queryBuilder({ one: undefined }));

      await expect(service.getVulnerability('v-1', WS)).rejects.toThrow(NotFoundException);
    });

    it('includes every source with its tool, agent and evidence', async () => {
      const { service, vulnRepo, dataSource } = setup();
      vulnRepo.createQueryBuilder.mockReturnValue(
        queryBuilder({ one: { id: 'v-1', reviewedById: 'u-3', fixClaimedById: null } }),
      );
      dataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('vulnerability_sources')) {
          return Promise.resolve([
            {
              id: 's-1',
              kind: 'ai_agent',
              toolId: null,
              agentName: 'pentest',
              agentConversationId: 'c-1',
              toolCallIds: ['call-1'],
              evidence: { requests: ['GET /'] },
              createdAt: new Date(),
              userId: 'u-1',
              userName: 'Ana',
              userImage: null,
            },
            { id: 's-2', kind: 'tool', toolId: 't-1', toolName: 'nuclei', toolLogoUrl: '/connectors/nuclei.png', createdAt: new Date() },
          ]);
        }
        if (sql.includes('FROM "users"')) {
          return Promise.resolve([{ id: 'u-3', name: 'Rev', image: 'r.png' }]);
        }
        return Promise.resolve([]);
      });

      const detail = await service.getVulnerability('v-1', WS);

      expect(detail.sources).toEqual([
        expect.objectContaining({
          kind: 'ai_agent',
          tool: null,
          agentName: 'pentest',
          agentConversationId: 'c-1',
          toolCallIds: ['call-1'],
          evidence: { requests: ['GET /'] },
          createdBy: { id: 'u-1', name: 'Ana', image: null },
        }),
        expect.objectContaining({ kind: 'tool', tool: { id: 't-1', name: 'nuclei', logoUrl: '/connectors/nuclei.png' } }),
      ]);
      expect(detail.reviewedByUser).toEqual({ id: 'u-3', name: 'Rev', image: 'r.png' });
      expect(detail.fixClaimedByUser).toBeNull();
      expect(detail.openIssue).toBeNull();
    });
  });

  describe('getVulnerabilityTimeline', () => {
    it('404s for a finding of another workspace', async () => {
      const { service, dataSource } = setup();

      await expect(service.getVulnerabilityTimeline('v-1', WS)).rejects.toThrow(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('returns events newest first with the actor as id/name/image', async () => {
      const { service, vulnRepo, dataSource } = setup();
      vulnRepo.find.mockResolvedValue([{ id: 'v-1' }]);
      dataSource.query.mockResolvedValue([
        { id: 'e-2', type: 'dismissed', actorId: 'u-1', actorName: 'Ana', actorImage: null, occurredAt: new Date(), data: { reason: 'wont_fix' } },
        { id: 'e-1', type: 'detected', actorId: null, toStatus: 'new', occurredAt: new Date() },
      ]);

      const { data } = await service.getVulnerabilityTimeline('v-1', WS);

      expect(dataSource.query.mock.calls[0][0]).toContain('ORDER BY e."occurredAt" DESC');
      expect(dataSource.query.mock.calls[0][1]).toEqual(['v-1', WS]);
      expect(data[0]).toMatchObject({ id: 'e-2', actor: { id: 'u-1', name: 'Ana', image: null } });
      expect(data[1]).toMatchObject({ id: 'e-1', actor: null, toStatus: 'new' });
    });
  });

  describe('getVulnerabilitiesStatistics', () => {
    it('adds lifecycle counts and MTTR per severity', async () => {
      const { service, dataSource } = setup();
      dataSource.query
        .mockResolvedValueOnce([{ severity: Severity.HIGH, count: '4' }])
        .mockResolvedValueOnce([
          { new: '2', active: '3', resurfaced: '1', fixed: '5', newLast7Days: '2', fixedLast30Days: '4', overdue: '1', pendingReview: '6' },
        ])
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([{ severity: Severity.HIGH, days: '3.456', count: '2' }]);

      const stats = await service.getVulnerabilitiesStatistics({ targetIds: ['t-1'] }, WS);

      expect(stats.data).toContainEqual({ severity: Severity.HIGH, count: 4 });
      expect(stats.data).toContainEqual({ severity: Severity.LOW, count: 0 });
      expect(stats.byDetectionStatus).toEqual({ new: 2, active: 3, resurfaced: 1, fixed: 5 });
      expect(stats).toMatchObject({
        newLast7Days: 2,
        resurfacedLast30Days: 1,
        fixedLast30Days: 4,
        overdue: 1,
        pendingReview: 6,
      });
      expect(stats.mttr).toContainEqual({ severity: Severity.HIGH, days: 3.5, count: 2 });
      expect(stats.mttr).toContainEqual({ severity: Severity.CRITICAL, days: null, count: 0 });
      // Every query is workspace + target scoped
      for (const [sql, params] of dataSource.query.mock.calls as Array<[string, unknown[]]>) {
        expect(sql).toContain('t."workspaceId" = $1');
        expect(sql).toContain('t.id = ANY($2::uuid[])');
        expect(params).toEqual([WS, ['t-1']]);
      }
    });
  });

  describe('getVulnerabilitiesStatistics in a project', () => {
    it('scopes every count to the project and adds provenance counts', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('AS provenance')
            ? [
                { provenance: VulnerabilityProvenance.NEW, count: '4' },
                { provenance: VulnerabilityProvenance.NOT_SEEN, count: '1' },
              ]
            : [],
        ),
      );

      const stats = await service.getVulnerabilitiesStatistics({ projectId: 'p-1' }, WS);

      expect(stats.provenanceCounts).toEqual({ new: 4, recurring: 0, notSeen: 1 });
      for (const [sql, params] of dataSource.query.mock.calls as Array<[string, unknown[]]>) {
        expect(params).toEqual([WS, 'p-1']);
        expect(sql).toContain(`"projectId" = $2::uuid`);
      }
    });

    it('has no provenance counts outside a project', async () => {
      const { service } = setup();
      const stats = await service.getVulnerabilitiesStatistics({}, WS);
      expect(stats).not.toHaveProperty('provenanceCounts');
    });
  });

  describe('bulkDismissVulnerabilities', () => {
    const approved = (id: string) => ({ id, reviewStatus: 'approved', detectionStatus: 'active' });

    it('requires expiresAt for a risk acceptance', async () => {
      const { service } = setup();
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, { reason: DismissReason.RISK_ACCEPTED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an acceptance beyond riskAcceptMaxDays or in the past', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockResolvedValue([{ value: { riskAcceptMaxDays: 30 } }]);
      const tooLate = new Date(Date.now() + 31 * DAY).toISOString();
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, {
          reason: DismissReason.RISK_ACCEPTED,
          expiresAt: tooLate,
        }),
      ).rejects.toThrow('at most 30 days');
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, {
          reason: DismissReason.RISK_ACCEPTED,
          expiresAt: new Date(Date.now() - DAY).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expiresAt for any other reason', async () => {
      const { service } = setup();
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, {
          reason: DismissReason.WONT_FIX,
          expiresAt: new Date(Date.now() + DAY).toISOString(),
        }),
      ).rejects.toThrow('only applies to the risk_accepted');
    });

    it('404s for findings of another workspace', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.find.mockResolvedValue([approved('v-1')]);
      await expect(
        service.bulkDismissVulnerabilities(['v-1', 'v-other'], WS, user, {
          reason: DismissReason.FALSE_POSITIVE,
        }),
      ).rejects.toThrow('v-other');
    });

    it('refuses AI proposals', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.find.mockResolvedValue([{ id: 'v-1', reviewStatus: 'pending_review' }]);
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, { reason: DismissReason.FALSE_POSITIVE }),
      ).rejects.toThrow('Only approved findings');
    });

    it('refuses findings already dismissed', async () => {
      const { service, vulnRepo, dismissRepo } = setup();
      vulnRepo.find.mockResolvedValue([approved('v-1')]);
      dismissRepo.find.mockResolvedValue([{ id: 'd-1', vulnerabilityId: 'v-1', expiresAt: null }]);
      await expect(
        service.bulkDismissVulnerabilities(['v-1'], WS, user, { reason: DismissReason.FALSE_POSITIVE }),
      ).rejects.toThrow('already dismissed');
    });

    it('accepts a risk until expiresAt, replacing an expired acceptance, and records DISMISSED', async () => {
      const { service, vulnRepo, dismissRepo, manager } = setup();
      vulnRepo.find.mockResolvedValue([approved('v-1')]);
      dismissRepo.find.mockResolvedValue([
        { id: 'd-old', vulnerabilityId: 'v-1', expiresAt: new Date(Date.now() - DAY) },
      ]);
      const expiresAt = new Date(Date.now() + 10 * DAY).toISOString();

      await service.bulkDismissVulnerabilities(['v-1'], WS, user, {
        reason: DismissReason.RISK_ACCEPTED,
        comment: 'compensating control',
        expiresAt,
      });

      expect(manager.delete).toHaveBeenCalledWith(VulnerabilityDismissal, {
        id: expect.objectContaining({ _value: ['d-old'] }),
      });
      expect(manager.save).toHaveBeenCalledWith(VulnerabilityDismissal, [
        expect.objectContaining({
          vulnerabilityId: 'v-1',
          userId: 'u-1',
          reason: DismissReason.RISK_ACCEPTED,
          expiresAt: new Date(expiresAt),
        }),
      ]);
      expect(eventsOf(manager)).toEqual([
        expect.objectContaining({
          vulnerabilityId: 'v-1',
          workspaceId: WS,
          type: 'dismissed',
          actorId: 'u-1',
          data: { reason: 'risk_accepted', comment: 'compensating control', expiresAt: new Date(expiresAt).toISOString() },
        }),
      ]);
    });
  });

  describe('bulkReopenVulnerabilities', () => {
    it('takes vulnerability ids and 404s for one that is not dismissed', async () => {
      const { service, dismissRepo } = setup();
      dismissRepo.find.mockResolvedValue([{ id: 'd-1', vulnerabilityId: 'v-1' }]);

      await expect(service.bulkReopenVulnerabilities(['v-1', 'v-2'], WS, user)).rejects.toThrow(
        'Dismissed vulnerabilities not found: v-2',
      );
      expect(dismissRepo.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          vulnerabilityId: expect.objectContaining({ _value: ['v-1', 'v-2'] }),
          vulnerability: { asset: { target: { workspaceId: WS } } },
        }),
      });
    });

    it('removes the dismissals and records REOPENED', async () => {
      const { service, dismissRepo, manager } = setup();
      dismissRepo.find.mockResolvedValue([
        { id: 'd-1', vulnerabilityId: 'v-1', reason: DismissReason.WONT_FIX, expiresAt: null },
      ]);

      expect(await service.bulkReopenVulnerabilities(['v-1'], WS, user)).toEqual({ reopened: 1 });

      expect(manager.delete).toHaveBeenCalledWith(VulnerabilityDismissal, {
        id: expect.objectContaining({ _value: ['d-1'] }),
      });
      expect(eventsOf(manager)).toEqual([
        expect.objectContaining({
          vulnerabilityId: 'v-1',
          type: 'reopened',
          actorId: 'u-1',
          data: { previousReason: 'wont_fix', expiresAt: null },
        }),
      ]);
    });
  });

  describe('claimFix', () => {
    it('marks open findings claimed and says how the claim gets verified', async () => {
      const { service, vulnRepo, manager } = setup();
      vulnRepo.find.mockResolvedValue([
        { id: 'v-1', reviewStatus: 'approved', detectionStatus: 'active', scanScopeKey: 'k' },
        { id: 'v-2', reviewStatus: 'approved', detectionStatus: 'new', scanScopeKey: null },
      ]);

      expect(await service.claimFix(['v-1', 'v-2'], WS, user, 'patched')).toEqual({ updated: 2 });

      expect(manager.update).toHaveBeenCalledWith(
        Vulnerability,
        { id: expect.objectContaining({ _value: ['v-1', 'v-2'] }) },
        { fixClaimedAt: expect.any(Date), fixClaimedById: 'u-1' },
      );
      expect(eventsOf(manager)).toEqual([
        expect.objectContaining({
          vulnerabilityId: 'v-1',
          type: 'fix_claimed',
          data: { note: 'patched', verification: 'next_covering_scan' },
        }),
        expect.objectContaining({
          vulnerabilityId: 'v-2',
          data: { note: 'patched', verification: 'not_verifiable_by_scan' },
        }),
      ]);
    });

    it('refuses fixed findings and proposals', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.find.mockResolvedValue([
        { id: 'v-1', reviewStatus: 'approved', detectionStatus: 'fixed' },
        { id: 'v-2', reviewStatus: 'pending_review', detectionStatus: 'new' },
      ]);
      await expect(service.claimFix(['v-1', 'v-2'], WS, user)).rejects.toThrow('v-1, v-2');
    });

    it('404s outside the workspace', async () => {
      const { service } = setup();
      await expect(service.claimFix(['v-1'], WS, user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteVulnerabilityAnalysis', () => {
    it('resets the analysis of a finding of the workspace (target.workspaceId, no relation needed)', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.findOne.mockResolvedValue({ id: 'v-1', asset: { target: { workspaceId: WS } } });

      await expect(service.deleteVulnerabilityAnalysis('v-1', WS)).resolves.toEqual({
        message: 'Analysis result deleted successfully',
      });
      expect(vulnRepo.update).toHaveBeenCalledWith(
        { id: 'v-1' },
        { analyzeStatus: VulnerabilityAnalyzeStatus.NOT_ANALYZED, analyzeResult: '' },
      );
    });

    it('404s for another workspace', async () => {
      const { service, vulnRepo } = setup();
      vulnRepo.findOne.mockResolvedValue({ id: 'v-1', asset: { target: { workspaceId: 'ws-2' } } });

      await expect(service.deleteVulnerabilityAnalysis('v-1', WS)).rejects.toThrow(NotFoundException);
      expect(vulnRepo.update).not.toHaveBeenCalled();
    });
  });
});
