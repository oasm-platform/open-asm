import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversationMetadataDto } from '@/services/apis/gen/queries';
import {
  formatCost,
  formatDuration,
  formatTokens,
  TurnStatsPanel,
} from './turn-stats-panel';

const metadata: ConversationMetadataDto = {
  model: 'claude-sonnet-4-5',
  provider: 'anthropic',
  contextWindow: 200_000,
  contextWindowSource: 'catalog',
  catalogEstimated: false,
  contextUsedTokens: 50_000,
  lastTurn: {
    steps: 29,
    inputTokens: 117_900,
    outputTokens: 16_500,
    cacheReadTokens: 107_300,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cachePercent: 91,
    modelTimeMs: 249_000,
    toolTimeMs: 79_000,
    avgTtftMs: null,
    responseTokPerSec: 57,
    turnTokPerSec: 66,
    wallTimeMs: 328_000,
    subagentWaitMs: 0,
    costUsd: null,
  },
  totals: {
    inputTokens: 200_000,
    outputTokens: 20_000,
    costUsd: 0.5,
    costComplete: false,
    turns: 3,
  },
};

describe('TurnStatsPanel', () => {
  it('renders nothing before the conversation has a model', () => {
    const { container } = render(<TurnStatsPanel metadata={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the model and its context window usage', () => {
    render(<TurnStatsPanel metadata={metadata} />);
    expect(screen.getByText('claude-sonnet-4-5')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('50K / 200K context')).toBeTruthy();
    expect(screen.getByText('from models.dev')).toBeTruthy();
  });

  it('shows the latest turn stats', () => {
    render(<TurnStatsPanel metadata={metadata} />);
    expect(screen.getByText('4m9s')).toBeTruthy();
    expect(screen.getByText('1m19s')).toBeTruthy();
    expect(screen.getByText('29')).toBeTruthy();
    expect(screen.getByText('117.9K ↑ · 16.5K ↓')).toBeTruthy();
    expect(screen.getByText('91%')).toBeTruthy();
    expect(screen.getByText('n/a')).toBeTruthy();
    expect(screen.getByText('≥ $0.50')).toBeTruthy();
  });

  it('marks a guessed window as approximate', () => {
    render(
      <TurnStatsPanel
        metadata={{
          ...metadata,
          contextWindow: 128_000,
          contextWindowSource: 'default',
          lastTurn: undefined,
        }}
      />,
    );
    expect(screen.getByText('50K / ~128K context')).toBeTruthy();
    expect(screen.queryByText('Turn stats')).toBeNull();
  });

  it('survives a missing context window', () => {
    render(
      <TurnStatsPanel metadata={{ model: 'x', contextUsedTokens: 10 }} />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('formatters', () => {
  it('formats durations, tokens and cost', () => {
    expect(formatDuration(850)).toBe('850ms');
    expect(formatDuration(4_200)).toBe('4.2s');
    expect(formatDuration(null)).toBe('—');
    expect(formatTokens(1_234)).toBe('1.2K');
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.0012)).toBe('$0.0012');
    expect(formatCost(1.234)).toBe('$1.23');
  });
});
