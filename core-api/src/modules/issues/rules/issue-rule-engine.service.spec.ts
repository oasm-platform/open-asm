import { BOT_ID } from '@/common/constants/app.constants';
import {
  IssuePriority,
  IssueRuleGroupBy,
  IssueStatus,
  IssueType,
  Severity,
} from '@/common/enums/enum';
import { QueryFailedError } from 'typeorm';
import type { IssueRule } from '../entities/issue-rule.entity';
import { IssueAutomationService } from '../issue-automation.service';
import { IssueRuleEngine } from './issue-rule-engine.service';
import {
  derivePriority,
  earliestDueAt,
  groupKeyFor,
  matchesConditions,
  type RuleFinding,
} from './issue-rule-matching';

const WS = 'ws-1';

const finding = (overrides: Partial<RuleFinding> = {}): RuleFinding => ({
  id: 'v-1',
  name: 'SQL Injection',
  severity: Severity.HIGH,
  epssScore: 0.5,
  dueAt: null,
  assetId: 'a-1',
  assetValue: 'app.example.com',
  targetId: 't-1',
  targetValue: 'example.com',
  ...overrides,
});

const rule = (overrides: Partial<IssueRule> = {}): IssueRule =>
  ({
    id: 'r-1',
    workspaceId: WS,
    name: 'Critical & High',
    enabled: true,
    event: 'vulnerability.detected',
    conditions: { minSeverity: Severity.HIGH },
    issueType: IssueType.VULNERABILITY_REMEDIATION,
    groupBy: IssueRuleGroupBy.VULNERABILITY_NAME,
    priority: null,
    defaultAssigneeId: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }) as IssueRule;

const uniqueViolation = () =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('dup'), { code: '23505' }),
  );

describe('rule matching', () => {
  it('applies minSeverity, minEpss and targetIds', () => {
    expect(matchesConditions({ minSeverity: Severity.HIGH }, finding())).toBe(true);
    expect(
      matchesConditions(
        { minSeverity: Severity.HIGH },
        finding({ severity: Severity.MEDIUM }),
      ),
    ).toBe(false);
    expect(matchesConditions({ minEpss: 0.6 }, finding())).toBe(false);
    expect(matchesConditions({ minEpss: 0.5 }, finding())).toBe(true);
    expect(matchesConditions({ minEpss: 0.1 }, finding({ epssScore: null }))).toBe(
      false,
    );
    expect(matchesConditions({ targetIds: ['t-2'] }, finding())).toBe(false);
    expect(matchesConditions({ targetIds: [] }, finding())).toBe(true);
    expect(matchesConditions({}, finding({ severity: Severity.INFO }))).toBe(true);
  });

  it('groups by normalized name, asset, target or per finding', () => {
    const f = finding({ name: '  SQL   injection ' });
    expect(groupKeyFor(IssueRuleGroupBy.VULNERABILITY_NAME, f)).toBe(
      'vuln:sql injection',
    );
    expect(groupKeyFor(IssueRuleGroupBy.ASSET, f)).toBe('asset:a-1');
    expect(groupKeyFor(IssueRuleGroupBy.TARGET, f)).toBe('target:t-1');
    expect(groupKeyFor(IssueRuleGroupBy.NONE, f)).toBe('finding:v-1');
  });

  it('derives priority from severity and picks the earliest due date', () => {
    expect(derivePriority(Severity.CRITICAL)).toBe(IssuePriority.P1);
    expect(derivePriority(Severity.HIGH)).toBe(IssuePriority.P2);
    expect(derivePriority(Severity.MEDIUM)).toBe(IssuePriority.P3);
    expect(derivePriority(Severity.LOW)).toBe(IssuePriority.P4);
    expect(derivePriority(Severity.INFO)).toBe(IssuePriority.P4);
    expect(
      earliestDueAt([null, new Date('2026-03-01'), new Date('2026-02-01')]),
    ).toEqual(new Date('2026-02-01'));
    expect(earliestDueAt([null, undefined])).toBeNull();
  });
});

function setup({
  rules = [rule()],
  findings = [finding()],
  linked = [] as string[],
  existing = null as object | null,
} = {}) {
  const insertedValues: unknown[][] = [];
  const insert = {
    insert: () => insert,
    into: () => insert,
    values: (v: unknown[]) => {
      insertedValues.push(v);
      return insert;
    },
    orIgnore: () => insert,
    execute: () => Promise.resolve({ raw: insertedValues.at(-1) }),
  };
  const manager = {
    findOne: jest.fn().mockResolvedValue(existing),
    query: jest.fn((sql: string) =>
      Promise.resolve(sql.includes('issue_counters') ? [{ lastNo: 5 }] : []),
    ),
    create: jest.fn((_: unknown, data: object) => data),
    save: jest.fn((x: object) => Promise.resolve({ id: 'i-new', ...x })),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => insert),
  };
  const rulesRepo = { find: jest.fn().mockResolvedValue(rules) };
  const dataSource = {
    getRepository: jest.fn(() => rulesRepo),
    query: jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('"issue_links" l')
          ? linked.map((id) => ({ id }))
          : findings,
      ),
    ),
    transaction: jest.fn((work: (m: typeof manager) => unknown) => work(manager)),
  };
  const events = { publish: jest.fn() };
  const engine = new IssueRuleEngine(dataSource as never, events as never);
  return { engine, dataSource, manager, rulesRepo, events, insertedValues };
}

describe('IssueRuleEngine', () => {
  it('does not load findings when no enabled rule listens to the event', async () => {
    const { engine, dataSource, rulesRepo } = setup({ rules: [] });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(rulesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WS, event: 'vulnerability.detected', enabled: true },
      }),
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('loads only open, approved findings of the workspace', async () => {
    const { engine, dataSource } = setup();
    await engine.onFindings('vulnerability.detected', WS, ['v-1', 'v-1']);
    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`"reviewStatus" = 'approved'`);
    expect(sql).toContain('t."workspaceId" = $2');
    expect(params).toEqual([['v-1'], WS]);
  });

  it('opens one issue per group with derived priority, earliest due date and rule assignee', async () => {
    const { engine, manager, events, insertedValues } = setup({
      rules: [rule({ defaultAssigneeId: 'u-9' })],
      findings: [
        finding({ id: 'v-1', dueAt: new Date('2026-05-01') }),
        finding({
          id: 'v-2',
          severity: Severity.CRITICAL,
          assetId: 'a-2',
          dueAt: new Date('2026-04-01'),
        }),
        finding({ id: 'v-3', name: 'XSS' }),
      ],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1', 'v-2', 'v-3']);

    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SQL Injection',
        groupKey: 'vuln:sql injection',
        priority: IssuePriority.P1,
        dueAt: new Date('2026-04-01'),
        assigneeId: 'u-9',
        ruleId: 'r-1',
        status: IssueStatus.OPEN,
        type: IssueType.VULNERABILITY_REMEDIATION,
        createdById: BOT_ID,
        no: 5,
      }),
    );
    expect(insertedValues[0]).toEqual([
      expect.objectContaining({ resourceId: 'v-1', addedById: null }),
      expect.objectContaining({ resourceId: 'v-2' }),
    ]);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'issue.created' }),
      expect.anything(),
      'system',
      expect.objectContaining({ ruleId: 'r-1', linkCount: 2 }),
    );
  });

  it('keeps a fixed rule priority', async () => {
    const { engine, manager } = setup({
      rules: [rule({ priority: IssuePriority.P4 })],
      findings: [finding({ severity: Severity.CRITICAL })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: IssuePriority.P4 }),
    );
  });

  it('skips findings below the rule conditions', async () => {
    const { engine, dataSource } = setup({
      findings: [finding({ severity: Severity.MEDIUM })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('honours minEpss and targetIds', async () => {
    const { engine, dataSource } = setup({
      rules: [rule({ conditions: { minEpss: 0.9 } })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    const second = setup({ rules: [rule({ conditions: { targetIds: ['t-2'] } })] });
    await second.engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(second.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('attaches to the open issue of the group, raising priority and pulling the due date in', async () => {
    const existing = {
      id: 'i-1',
      no: 3,
      workspaceId: WS,
      priority: IssuePriority.P3,
      dueAt: new Date('2026-09-01'),
    };
    const { engine, manager, events, insertedValues } = setup({
      existing,
      findings: [finding({ dueAt: new Date('2026-06-01') })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WS,
          type: IssueType.VULNERABILITY_REMEDIATION,
          groupKey: 'vuln:sql injection',
        }),
      }),
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'i-1' },
      { dueAt: new Date('2026-06-01'), priority: IssuePriority.P2 },
    );
    expect(insertedValues[0]).toEqual([
      expect.objectContaining({ issueId: 'i-1', resourceId: 'v-1' }),
    ]);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'issue.link.added' }),
      expect.objectContaining({ id: 'i-1' }),
      'system',
      expect.objectContaining({ count: 1 }),
    );
  });

  it('does not link a finding already on an open issue', async () => {
    const { engine, dataSource } = setup({ linked: ['v-1'] });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('links a finding once even when two rules match it', async () => {
    const { engine, dataSource } = setup({
      rules: [rule(), rule({ id: 'r-2', groupBy: IssueRuleGroupBy.ASSET })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('ignores rules of types rules cannot open', async () => {
    const { engine, dataSource } = setup({
      rules: [rule({ issueType: IssueType.TASK })],
    });
    await engine.onFindings('vulnerability.detected', WS, ['v-1']);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('retries once after losing the race, and joins the winner', async () => {
    const { engine, manager, dataSource } = setup();
    const winner = { id: 'i-won', workspaceId: WS, priority: IssuePriority.P2, dueAt: null };
    dataSource.transaction
      .mockImplementationOnce(() => Promise.reject(uniqueViolation()))
      .mockImplementationOnce((work: (m: typeof manager) => unknown) => {
        manager.findOne.mockResolvedValueOnce(winner);
        return work(manager);
      });
    const outcome = await engine.attachOrCreate(rule(), 'vuln:sql injection', [
      finding(),
    ]);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual(
      expect.objectContaining({ created: false, issue: winner }),
    );
  });

  it('gives up after the second unique violation', async () => {
    const { engine, dataSource } = setup();
    dataSource.transaction.mockImplementation(() =>
      Promise.reject(uniqueViolation()),
    );
    await expect(
      engine.attachOrCreate(rule(), 'k', [finding()]),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('IssueAutomationService', () => {
  function automation() {
    const handlers = { dispatch: jest.fn() };
    const rules = { onFindings: jest.fn() };
    return {
      service: new IssueAutomationService(handlers as never, rules as never),
      handlers,
      rules,
    };
  }

  it('runs rules for detected findings', async () => {
    const { service, handlers, rules } = automation();
    await service.onVulnerabilityEvent({
      event: 'vulnerability.detected',
      workspaceId: WS,
      vulnerabilityIds: ['v-1'],
    });
    expect(rules.onFindings).toHaveBeenCalledWith('vulnerability.detected', WS, ['v-1']);
    expect(handlers.dispatch).not.toHaveBeenCalled();
  });

  it('reopens before running rules for resurfaced findings', async () => {
    const { service, handlers, rules } = automation();
    await service.onVulnerabilityEvent({
      event: 'vulnerability.resurfaced',
      workspaceId: WS,
      vulnerabilityIds: ['v-1'],
      jobId: 'j-1',
    });
    expect(handlers.dispatch).toHaveBeenCalledWith({
      name: 'vulnerability.resurfaced',
      workspaceId: WS,
      vulnerabilityIds: ['v-1'],
      jobId: 'j-1',
    });
    expect(handlers.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      rules.onFindings.mock.invocationCallOrder[0],
    );
  });

  it('hands fixed findings to the handlers only', async () => {
    const { service, handlers, rules } = automation();
    await service.onVulnerabilityEvent({
      event: 'vulnerability.fixed',
      workspaceId: WS,
      vulnerabilityIds: ['v-1'],
      jobHistoryId: 'run-1',
    });
    expect(handlers.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'vulnerability.fixed', jobHistoryId: 'run-1' }),
    );
    expect(rules.onFindings).not.toHaveBeenCalled();
  });
});
