import {
  addSteps,
  addWait,
  computeCostUsd,
  emptyStats,
  finalizeStats,
  mergeStats,
  type StepLike,
} from './turn-stats';

const step = (
  usage: Partial<StepLike['usage']>,
  performance?: StepLike['performance'],
): StepLike => ({
  usage: {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    ...usage,
  },
  performance,
});

describe('turn stats', () => {
  it('sums tokens across steps, treating missing values as 0', () => {
    const acc = addSteps(emptyStats(0), [
      step({
        inputTokens: 1_000,
        outputTokens: 100,
        inputTokenDetails: {
          noCacheTokens: 200,
          cacheReadTokens: 800,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: { textTokens: 80, reasoningTokens: 20 },
      }),
      step({ inputTokens: 1_500, outputTokens: 50 }),
      step({}),
    ]);

    expect(acc).toMatchObject({
      steps: 3,
      inputTokens: 2_500,
      outputTokens: 150,
      cacheReadTokens: 800,
      reasoningTokens: 20,
      // 200 reported + 1500 derived (no details)
      noCacheTokens: 1_700,
      // last step that reported input usage
      lastContextTokens: 1_550,
    });
  });

  it('splits model time, tool time and streaming throughput', () => {
    const acc = addSteps(emptyStats(0), [
      step(
        { inputTokens: 10, outputTokens: 100 },
        { responseTimeMs: 2_000, stepTimeMs: 5_000, timeToFirstOutputMs: 1_000 },
      ),
      // non-streaming step: no TTFT
      step(
        { inputTokens: 10, outputTokens: 50 },
        { responseTimeMs: 1_000, stepTimeMs: 1_000 },
      ),
    ]);
    const stats = finalizeStats(acc, { now: 10_000 });

    expect(stats.modelTimeMs).toBe(3_000);
    expect(stats.toolTimeMs).toBe(3_000);
    expect(stats.avgTtftMs).toBe(1_000);
    // only the streamed step: 100 tokens over (2000 - 1000) ms
    expect(stats.responseTokPerSec).toBe(100);
    expect(stats.turnTokPerSec).toBe(15);
  });

  it('falls back to model time when no step streamed', () => {
    const acc = addSteps(emptyStats(0), [
      step({ outputTokens: 40 }, { responseTimeMs: 2_000, stepTimeMs: 2_000 }),
    ]);
    const stats = finalizeStats(acc, { now: 2_000 });
    expect(stats.avgTtftMs).toBeNull();
    expect(stats.responseTokPerSec).toBe(20);
  });

  it('computes the cache percentage and handles zero input', () => {
    const cached = addSteps(emptyStats(0), [
      step({
        inputTokens: 1_000,
        inputTokenDetails: {
          noCacheTokens: 90,
          cacheReadTokens: 910,
          cacheWriteTokens: 0,
        },
      }),
    ]);
    expect(finalizeStats(cached, { now: 1 }).cachePercent).toBe(91);
    expect(finalizeStats(emptyStats(0), { now: 1 }).cachePercent).toBe(0);
  });

  it('prices uncached, cached and output tokens per 1M', () => {
    const acc = {
      ...emptyStats(0),
      noCacheTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    expect(
      computeCostUsd(acc, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }),
    ).toBe(22.05);
    // missing cache prices fall back to the input price
    expect(computeCostUsd(acc, { input: 1, output: 2 })).toBe(5);
    expect(computeCostUsd(acc, undefined)).toBeNull();
  });

  it('excludes subagent waits from the wall time', () => {
    const acc = addWait({ ...emptyStats(0), outputTokens: 100 }, 6_000);
    const stats = finalizeStats(acc, { now: 10_000 });
    expect(stats.wallTimeMs).toBe(4_000);
    expect(stats.subagentWaitMs).toBe(6_000);
    expect(stats.turnTokPerSec).toBe(25);
  });

  it('merges accumulators keeping the earliest start and latest context', () => {
    const a = addSteps(emptyStats(100), [step({ inputTokens: 10, outputTokens: 1 })]);
    const b = addSteps(emptyStats(50), [step({ inputTokens: 20, outputTokens: 2 })]);
    const merged = mergeStats(a, b);
    expect(merged.steps).toBe(2);
    expect(merged.startedAt).toBe(50);
    expect(merged.lastContextTokens).toBe(22);
    expect(mergeStats(a, emptyStats(200)).lastContextTokens).toBe(11);
  });
});
