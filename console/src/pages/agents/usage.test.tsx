import { renderWithProviders, screen } from '@/test/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentUsageResponseDto } from '@/services/apis/gen/queries';
import AgentUsagePage, { formatCacheHit, formatUsageCost } from './usage';

vi.mock('@/hooks/useWorkspaceSelector', () => ({
  useWorkspaceState: () => ({ state: { selectedWorkspaceId: 'ws-1' } }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, isLoading: false }),
}));

// jsdom has no layout for recharts
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: () => <div data-testid="usage-chart" />,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock('@/services/apis/gen/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/apis/gen/queries')>()),
  useAgentsControllerGetUsage: vi.fn(),
}));

const totals = {
  requests: 46,
  inputTokens: 900_000,
  outputTokens: 20_000,
  cacheReadTokens: 450_000,
  costUsd: 1.5,
  costComplete: true,
};

const USAGE: AgentUsageResponseDto = {
  days: 30,
  tz: 'UTC',
  summary: { ...totals, sessions: 2, responses: 3, subagentRuns: 1 },
  daily: [{ date: '2026-10-20', ...totals }],
  models: [{ model: 'claude-sonnet-4-5', provider: 'anthropic', ...totals }],
  sessions: [
    {
      id: 'c1',
      title: 'Recon acme.com',
      lastActiveAt: new Date().toISOString(),
      ...totals,
    },
  ],
};

async function setup(data: AgentUsageResponseDto) {
  const { useAgentsControllerGetUsage } = await import(
    '@/services/apis/gen/queries'
  );
  vi.mocked(useAgentsControllerGetUsage).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useAgentsControllerGetUsage>);
  return {
    hook: vi.mocked(useAgentsControllerGetUsage),
    ...renderWithProviders(<AgentUsagePage />),
  };
}

describe('formatUsageCost', () => {
  it('marks a cost that misses unpriced calls', () => {
    expect(formatUsageCost({ costUsd: 1.5, costComplete: true })).toBe('$1.50');
    expect(formatUsageCost({ costUsd: 1.5, costComplete: false })).toBe(
      '≥ $1.50',
    );
    expect(formatUsageCost({ costUsd: 0, costComplete: false })).toBe('n/a');
  });
});

describe('formatCacheHit', () => {
  it('is the share of input tokens read from cache', () => {
    expect(formatCacheHit({ inputTokens: 1000, cacheReadTokens: 915 })).toBe(
      '92%',
    );
    expect(formatCacheHit({ inputTokens: 0, cacheReadTokens: 0 })).toBe('—');
  });
});

describe('AgentUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the totals, models and top sessions', async () => {
    await setup(USAGE);

    expect(await screen.findByText('Input tokens')).toBeInTheDocument();
    expect(screen.getByText('450K read from cache')).toBeInTheDocument();
    expect(screen.getByText('920K tokens in total')).toBeInTheDocument();
    expect(screen.getByText('3 answers · 1 subagent runs')).toBeInTheDocument();
    // Cache hit tile and the model row
    expect(screen.getAllByText('50%')).toHaveLength(2);
    // The session row
    expect(screen.getByText('900K in · 20K out')).toBeInTheDocument();
    expect(screen.getByText('50% cache · $1.50')).toBeInTheDocument();
    expect(screen.getByTestId('usage-chart')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Recon acme\.com/ })).toHaveAttribute(
      'href',
      '/aistudio/conversations/c1',
    );
  });

  it('asks for the last 30 days in the browser time zone', async () => {
    const { hook } = await setup(USAGE);

    await screen.findByText('Input tokens');
    expect(hook).toHaveBeenCalledWith(
      { days: 30, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      expect.anything(),
    );
  });

  it('switches the period', async () => {
    const { hook, user } = await setup(USAGE);

    await user.click(await screen.findByRole('combobox', { name: 'Usage period' }));
    await user.click(await screen.findByRole('option', { name: 'Last 7 days' }));

    expect(hook).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 7 }),
      expect.anything(),
    );
  });

  it('says when there is no usage in the period', async () => {
    await setup({
      ...USAGE,
      summary: {
        ...USAGE.summary,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessions: 0,
      },
      models: [],
      sessions: [],
    });

    expect(
      await screen.findByText('No AI Studio usage in the last 30 days.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('usage-chart')).not.toBeInTheDocument();
  });
});
