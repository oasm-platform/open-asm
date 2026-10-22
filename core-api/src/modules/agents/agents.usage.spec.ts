import {
  AgentsUsageService,
  USAGE_TOP_SESSIONS,
  summarizeUsage,
  usageDates,
  type UsageRow,
} from './agents.usage';

const row = (overrides: Partial<UsageRow> = {}): UsageRow => ({
  date: '2026-10-20',
  conversationId: 'c1',
  title: 'Recon acme.com',
  model: 'claude-sonnet-4-5',
  provider: 'anthropic',
  lastAt: new Date('2026-10-20T08:00:00Z'),
  responses: 1,
  subagentRuns: 0,
  requests: 3,
  inputTokens: 1000,
  outputTokens: 100,
  cacheReadTokens: 800,
  costUsd: 0.01,
  costComplete: true,
  ...overrides,
});

describe('usageDates', () => {
  it('lists the last days up to today, oldest first, across a month', () => {
    expect(usageDates(3, 'UTC', new Date('2026-11-01T10:00:00Z'))).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('counts today in the requested time zone', () => {
    // 20:00 UTC is already the next day in Vietnam (UTC+7)
    const now = new Date('2026-10-20T20:00:00Z');
    expect(usageDates(1, 'UTC', now)).toEqual(['2026-10-20']);
    expect(usageDates(1, 'Asia/Ho_Chi_Minh', now)).toEqual(['2026-10-21']);
  });
});

describe('summarizeUsage', () => {
  const dates = ['2026-10-19', '2026-10-20'];

  it('returns every day with zeros when there is no usage', () => {
    const usage = summarizeUsage([], dates, 'UTC');

    expect(usage.daily.map((d) => [d.date, d.inputTokens])).toEqual([
      ['2026-10-19', 0],
      ['2026-10-20', 0],
    ]);
    expect(usage.summary).toMatchObject({
      sessions: 0,
      requests: 0,
      costUsd: 0,
      costComplete: true,
    });
    expect(usage.models).toEqual([]);
    expect(usage.sessions).toEqual([]);
  });

  it('rolls rows up per day, model and conversation', () => {
    const usage = summarizeUsage(
      [
        row({ date: '2026-10-19' }),
        row({ responses: 0, subagentRuns: 2, inputTokens: 500 }),
        row({
          conversationId: 'c2',
          title: null,
          model: 'gpt-5',
          provider: 'openai',
          inputTokens: 4000,
          costUsd: 0,
          costComplete: false,
          lastAt: new Date('2026-10-20T09:00:00Z'),
        }),
      ],
      dates,
      'Asia/Ho_Chi_Minh',
    );

    expect(usage).toMatchObject({ days: 2, tz: 'Asia/Ho_Chi_Minh' });
    expect(usage.summary).toMatchObject({
      sessions: 2,
      responses: 2,
      subagentRuns: 2,
      requests: 9,
      inputTokens: 5500,
      outputTokens: 300,
      costComplete: false,
    });
    expect(usage.summary.costUsd).toBeCloseTo(0.02);
    expect(usage.daily.map((d) => [d.date, d.inputTokens])).toEqual([
      ['2026-10-19', 1000],
      ['2026-10-20', 4500],
    ]);
    // Most tokens first
    expect(usage.models.map((m) => [m.model, m.inputTokens])).toEqual([
      ['gpt-5', 4000],
      ['claude-sonnet-4-5', 1500],
    ]);
    expect(usage.sessions.map((s) => [s.id, s.inputTokens])).toEqual([
      ['c2', 4000],
      ['c1', 1500],
    ]);
    expect(usage.sessions[1].lastActiveAt).toEqual(
      new Date('2026-10-20T08:00:00Z'),
    );
  });

  it('keeps the latest activity of a conversation', () => {
    const usage = summarizeUsage(
      [
        row({ lastAt: new Date('2026-10-20T10:00:00Z') }),
        row({ date: '2026-10-19', lastAt: new Date('2026-10-19T10:00:00Z') }),
      ],
      dates,
      'UTC',
    );
    expect(usage.sessions[0].lastActiveAt).toEqual(
      new Date('2026-10-20T10:00:00Z'),
    );
  });

  it('lists only the top conversations', () => {
    const rows = Array.from({ length: USAGE_TOP_SESSIONS + 5 }, (_, i) =>
      row({ conversationId: `c${i}`, inputTokens: i }),
    );
    const usage = summarizeUsage(rows, dates, 'UTC');

    expect(usage.summary.sessions).toBe(USAGE_TOP_SESSIONS + 5);
    expect(usage.sessions).toHaveLength(USAGE_TOP_SESSIONS);
    expect(usage.sessions[0].id).toBe(`c${USAGE_TOP_SESSIONS + 4}`);
  });

  it('ignores rows outside the requested days', () => {
    const usage = summarizeUsage([row({ date: '2026-10-01' })], dates, 'UTC');
    expect(usage.daily.every((d) => d.inputTokens === 0)).toBe(true);
  });
});

describe('AgentsUsageService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-20T20:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("queries the user's conversations of the workspace from the first day", async () => {
    const query = jest.fn().mockResolvedValue([row()]);
    const service = new AgentsUsageService({ query } as never);

    const usage = await service.getUsage('w1', 'u1', {
      days: 7,
      tz: 'Asia/Ho_Chi_Minh',
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'w1',
      'u1',
      '2026-10-15',
      'Asia/Ho_Chi_Minh',
    ]);
    expect(usage.daily.map((d) => d.date).at(-1)).toBe('2026-10-21');
  });
});
