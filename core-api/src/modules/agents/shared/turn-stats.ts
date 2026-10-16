import type { LanguageModelUsage, StepResultPerformance } from 'ai';
import type { TurnStats } from './conversation-metadata';
import type { ModelCost } from './models-dev';

/** The part of an AI SDK `StepResult` the stats need. */
export interface StepLike {
  usage: LanguageModelUsage;
  performance?: Partial<StepResultPerformance>;
}

/** Running totals across the steps of a turn (or a subagent run). */
export interface StatsAccumulator {
  steps: number;
  inputTokens: number;
  outputTokens: number;
  noCacheTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  modelTimeMs: number;
  toolTimeMs: number;
  ttftSumMs: number;
  ttftCount: number;
  /** Output tokens of steps that streamed (have a TTFT). */
  streamOutputTokens: number;
  /** Model time after the first token, for steps that streamed. */
  streamMs: number;
  /** Prompt + response tokens of the last step that reported input usage. */
  lastContextTokens: number;
  /** Time spent waiting on background subagents. */
  waitMs: number;
  startedAt: number;
}

const n = (v: number | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function emptyStats(startedAt = Date.now()): StatsAccumulator {
  return {
    steps: 0,
    inputTokens: 0,
    outputTokens: 0,
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    modelTimeMs: 0,
    toolTimeMs: 0,
    ttftSumMs: 0,
    ttftCount: 0,
    streamOutputTokens: 0,
    streamMs: 0,
    lastContextTokens: 0,
    waitMs: 0,
    startedAt,
  };
}

/** Adds AI SDK steps to the accumulator (returns a new object). */
export function addSteps(
  acc: StatsAccumulator,
  steps: readonly StepLike[],
): StatsAccumulator {
  const next = { ...acc };
  for (const step of steps) {
    const usage = step.usage ?? ({} as LanguageModelUsage);
    const input = n(usage.inputTokens);
    const output = n(usage.outputTokens);
    const cacheRead = n(usage.inputTokenDetails?.cacheReadTokens);
    const cacheWrite = n(usage.inputTokenDetails?.cacheWriteTokens);
    const noCache =
      usage.inputTokenDetails?.noCacheTokens !== undefined
        ? n(usage.inputTokenDetails.noCacheTokens)
        : Math.max(0, input - cacheRead - cacheWrite);

    next.steps += 1;
    next.inputTokens += input;
    next.outputTokens += output;
    next.noCacheTokens += noCache;
    next.cacheReadTokens += cacheRead;
    next.cacheWriteTokens += cacheWrite;
    next.reasoningTokens += n(usage.outputTokenDetails?.reasoningTokens);
    if (usage.inputTokens !== undefined) {
      next.lastContextTokens = input + output;
    }

    const perf = step.performance;
    if (perf) {
      const response = n(perf.responseTimeMs);
      next.modelTimeMs += response;
      next.toolTimeMs += Math.max(0, n(perf.stepTimeMs) - response);
      if (perf.timeToFirstOutputMs !== undefined) {
        const ttft = n(perf.timeToFirstOutputMs);
        next.ttftSumMs += ttft;
        next.ttftCount += 1;
        if (response - ttft > 0) {
          next.streamMs += response - ttft;
          next.streamOutputTokens += output;
        }
      }
    }
  }
  return next;
}

/** Combines two accumulators; `b` is the later one. */
export function mergeStats(
  a: StatsAccumulator,
  b: StatsAccumulator,
): StatsAccumulator {
  return {
    steps: a.steps + b.steps,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    noCacheTokens: a.noCacheTokens + b.noCacheTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    modelTimeMs: a.modelTimeMs + b.modelTimeMs,
    toolTimeMs: a.toolTimeMs + b.toolTimeMs,
    ttftSumMs: a.ttftSumMs + b.ttftSumMs,
    ttftCount: a.ttftCount + b.ttftCount,
    streamOutputTokens: a.streamOutputTokens + b.streamOutputTokens,
    streamMs: a.streamMs + b.streamMs,
    lastContextTokens: b.steps > 0 ? b.lastContextTokens : a.lastContextTokens,
    waitMs: a.waitMs + b.waitMs,
    startedAt: Math.min(a.startedAt, b.startedAt),
  };
}

export function addWait(acc: StatsAccumulator, ms: number): StatsAccumulator {
  return { ...acc, waitMs: acc.waitMs + n(ms) };
}

/**
 * Cost in USD from models.dev prices (per 1M tokens). Reasoning tokens are
 * already part of the output count. Returns null when the price is unknown.
 */
export function computeCostUsd(
  acc: StatsAccumulator,
  cost?: ModelCost,
): number | null {
  if (!cost) return null;
  const usd =
    (acc.noCacheTokens * cost.input +
      acc.cacheReadTokens * (cost.cacheRead ?? cost.input) +
      acc.cacheWriteTokens * (cost.cacheWrite ?? cost.input) +
      acc.outputTokens * cost.output) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export function finalizeStats(
  acc: StatsAccumulator,
  opts: { cost?: ModelCost; now?: number } = {},
): TurnStats {
  const now = opts.now ?? Date.now();
  const wallTimeMs = Math.max(0, now - acc.startedAt - acc.waitMs);
  const out = acc.outputTokens;

  let responseTokPerSec: number | null = null;
  if (acc.streamMs > 0) {
    responseTokPerSec = round1(acc.streamOutputTokens / (acc.streamMs / 1000));
  } else if (acc.modelTimeMs > 0) {
    responseTokPerSec = round1(out / (acc.modelTimeMs / 1000));
  }

  return {
    steps: acc.steps,
    inputTokens: acc.inputTokens,
    outputTokens: out,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    reasoningTokens: acc.reasoningTokens,
    cachePercent:
      acc.inputTokens > 0
        ? round1((acc.cacheReadTokens / acc.inputTokens) * 100)
        : 0,
    modelTimeMs: Math.round(acc.modelTimeMs),
    toolTimeMs: Math.round(acc.toolTimeMs),
    avgTtftMs:
      acc.ttftCount > 0 ? Math.round(acc.ttftSumMs / acc.ttftCount) : null,
    responseTokPerSec,
    turnTokPerSec: wallTimeMs > 0 ? round1(out / (wallTimeMs / 1000)) : null,
    wallTimeMs,
    subagentWaitMs: Math.round(acc.waitMs),
    costUsd: computeCostUsd(acc, opts.cost),
  };
}
