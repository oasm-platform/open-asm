import { ContextBudgetManager } from './context-budget-manager';
import { TokenCounter } from './token-counter';

describe('ContextBudgetManager', () => {
  // ─── calculateBudget ────────────────────────────────────────────

  describe('calculateBudget', () => {
    it('should calculate budget with default context window (128k)', () => {
      const budget = ContextBudgetManager.calculateBudget();

      expect(budget.totalTokens).toBe(128_000);
      expect(budget.outputReserve).toBe(38_400); // floor(128000 * 0.3)
      expect(budget.availableForInput).toBe(89_600); // 128000 - 38400
      expect(budget.compactionThreshold).toBe(76_800); // floor(128000 * 0.6)
      expect(budget.pruningThreshold).toBe(102_400); // floor(128000 * 0.8)
    });

    it('should calculate budget with custom context window', () => {
      const budget = ContextBudgetManager.calculateBudget(64_000);

      expect(budget.totalTokens).toBe(64_000);
      expect(budget.outputReserve).toBe(19_200); // floor(64000 * 0.3)
      expect(budget.availableForInput).toBe(44_800);
      expect(budget.compactionThreshold).toBe(38_400); // floor(64000 * 0.6)
      expect(budget.pruningThreshold).toBe(51_200); // floor(64000 * 0.8)
    });

    it('should handle zero context window', () => {
      const budget = ContextBudgetManager.calculateBudget(0);

      expect(budget.totalTokens).toBe(0);
      expect(budget.outputReserve).toBe(0);
      expect(budget.availableForInput).toBe(0);
      expect(budget.compactionThreshold).toBe(0);
      expect(budget.pruningThreshold).toBe(0);
    });

    it('should clamp negative context window to zero', () => {
      const budget = ContextBudgetManager.calculateBudget(-1000);

      expect(budget.totalTokens).toBe(0);
      expect(budget.outputReserve).toBe(0);
      expect(budget.availableForInput).toBe(0);
    });

    it('should handle very small context window', () => {
      const budget = ContextBudgetManager.calculateBudget(100);

      expect(budget.totalTokens).toBe(100);
      expect(budget.outputReserve).toBe(30); // floor(100 * 0.3)
      expect(budget.availableForInput).toBe(70);
      expect(budget.compactionThreshold).toBe(60); // floor(100 * 0.6)
      expect(budget.pruningThreshold).toBe(80); // floor(100 * 0.8)
    });

    it('should maintain budget invariants across window sizes', () => {
      for (const window of [1_000, 16_000, 32_000, 64_000, 128_000, 200_000]) {
        const budget = ContextBudgetManager.calculateBudget(window);

        expect(budget.outputReserve + budget.availableForInput).toBe(budget.totalTokens);
        expect(budget.compactionThreshold).toBeLessThan(budget.pruningThreshold);
        expect(budget.pruningThreshold).toBeLessThanOrEqual(budget.totalTokens);
      }
    });
  });

  // ─── checkBudget ────────────────────────────────────────────────

  describe('checkBudget', () => {
    it('should return fits=true when context is well within budget', () => {
      const result = ContextBudgetManager.checkBudget(
        ['system prompt'],
        [{ role: 'user', content: 'hello' }],
        128_000,
      );

      // systemTokens = ceil(13/4) = 4, historyTokens = ceil(5/4) = 2
      expect(result.fits).toBe(true);
      expect(result.needsCompaction).toBe(false);
      expect(result.needsPruning).toBe(false);
      expect(result.systemTokens).toBe(TokenCounter.estimateParts(['system prompt']));
      expect(result.historyTokens).toBe(2);
      expect(result.totalTokens).toBe(6);
    });

    it('should trigger compaction when total >= compactionThreshold', () => {
      // compactionThreshold = 76800 tokens → need >= 76800 tokens
      // 76800 tokens × 4 chars = 307200 chars minimum
      const largeContent = 'x'.repeat(307_200); // exactly 76800 tokens
      const result = ContextBudgetManager.checkBudget([largeContent], [], 128_000);

      expect(result.needsCompaction).toBe(true);
      expect(result.needsPruning).toBe(false);
      expect(result.totalTokens).toBe(76_800);
    });

    it('should trigger pruning when total >= pruningThreshold', () => {
      // pruningThreshold = 102400 tokens → need >= 102400 tokens
      // 102400 tokens × 4 chars = 409600 chars
      const largeContent = 'x'.repeat(409_600); // exactly 102400 tokens
      const result = ContextBudgetManager.checkBudget([largeContent], [], 128_000);

      expect(result.needsCompaction).toBe(true);
      expect(result.needsPruning).toBe(true);
      expect(result.totalTokens).toBe(102_400);
    });

    it('should return fits=false when context exceeds available input budget', () => {
      // availableForInput = 89600 tokens → need > 89600 tokens
      // 89601 tokens × 4 chars = 358404 chars
      const largeContent = 'x'.repeat(358_404); // 89601 tokens
      const result = ContextBudgetManager.checkBudget([largeContent], [], 128_000);

      expect(result.fits).toBe(false);
    });

    it('should handle null/undefined arrays gracefully', () => {
      const result = ContextBudgetManager.checkBudget(
        null as unknown as string[],
        null as unknown as Array<{ role: string; content: string }>,
        128_000,
      );

      expect(result.fits).toBe(true);
      expect(result.systemTokens).toBe(0);
      expect(result.historyTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('should handle empty arrays', () => {
      const result = ContextBudgetManager.checkBudget([], [], 128_000);

      expect(result.fits).toBe(true);
      expect(result.totalTokens).toBe(0);
      expect(result.systemTokens).toBe(0);
      expect(result.historyTokens).toBe(0);
    });

    it('should correctly sum system and history tokens', () => {
      const systemParts = ['You are a helpful assistant.', 'Tool definitions here.'];
      const messages = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = ContextBudgetManager.checkBudget(systemParts, messages, 128_000);

      expect(result.systemTokens).toBe(TokenCounter.estimateParts(systemParts));
      expect(result.historyTokens).toBe(
        TokenCounter.estimate('Hello world') + TokenCounter.estimate('Hi there!'),
      );
      expect(result.totalTokens).toBe(result.systemTokens + result.historyTokens);
    });

    it('should handle messages with empty content', () => {
      const messages = [
        { role: 'user', content: '' },
        { role: 'assistant', content: '' },
      ];

      const result = ContextBudgetManager.checkBudget([], messages, 128_000);

      // TokenCounter.estimate('') returns 0
      expect(result.historyTokens).toBe(0);
      expect(result.fits).toBe(true);
    });

    it('should handle messages with undefined content', () => {
      const messages = [
        { role: 'user', content: undefined as unknown as string },
      ];

      const result = ContextBudgetManager.checkBudget([], messages, 128_000);

      // TokenCounter.estimate(undefined) returns 0 (falsy check)
      expect(result.historyTokens).toBe(0);
      expect(result.fits).toBe(true);
    });

    it('should use default context window when not provided', () => {
      const result = ContextBudgetManager.checkBudget([], []);

      expect(result.budget.totalTokens).toBe(128_000);
      expect(result.budget.availableForInput).toBe(89_600);
    });
  });

  // ─── getPruningStrategy ─────────────────────────────────────────

  describe('getPruningStrategy', () => {
    it('should return keep-all strategy when well within budget (ratio < 0.6)', () => {
      // ratio = totalTokens / availableForInput ≈ 0.000045 → keep-all
      const strategy = ContextBudgetManager.getPruningStrategy(
        ['system'],
        [{ role: 'user', content: 'hello' }],
        128_000,
      );

      expect(strategy.keepSystemContext).toBe(true);
      expect(strategy.keepSummary).toBe(true);
      expect(strategy.pruneToolDetails).toBe(false);
      expect(strategy.removeOldestFirst).toBe(false);
      expect(strategy.maxMessages).toBe(1); // totalMessages = 1
    });

    it('should return light pruning strategy when approaching threshold (0.6 <= ratio < 0.8)', () => {
      // Need ratio in [0.6, 0.8) → totalTokens in [53760, 71680)
      // 10 messages × 'x'.repeat(24000): each = ceil(24000/4) = 6000 tokens
      // historyTokens = 60000, systemTokens = ceil(6/4) = 2
      // total = 60002, ratio = 60002/89600 ≈ 0.67 → light pruning
      const messages = Array.from({ length: 10 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(24_000),
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      expect(strategy.keepSystemContext).toBe(true);
      expect(strategy.keepSummary).toBe(true);
      expect(strategy.pruneToolDetails).toBe(false);
      expect(strategy.removeOldestFirst).toBe(true);
      // maxMessages = max(10, floor(10 * 0.7)) = max(10, 7) = 10
      expect(strategy.maxMessages).toBe(10);
    });

    it('should return aggressive pruning strategy when beyond threshold (ratio >= 0.8)', () => {
      // Need ratio >= 0.8 → totalTokens >= 71680
      // 10 messages × 'x'.repeat(30000): each = ceil(30000/4) = 7500 tokens
      // historyTokens = 75000, systemTokens = ceil(6/4) = 2
      // total = 75002, ratio = 75002/89600 ≈ 0.837 → aggressive
      const messages = Array.from({ length: 10 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(30_000),
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      expect(strategy.pruneToolDetails).toBe(true);
      expect(strategy.removeOldestFirst).toBe(true);
      // maxMessages = max(5, floor(10 * 0.4)) = max(5, 4) = 5
      expect(strategy.maxMessages).toBe(5);
    });

    it('should always keep system context and summary regardless of budget pressure', () => {
      // Force aggressive pruning with very large context
      const messages = Array.from({ length: 20 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(30_000),
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      expect(strategy.keepSystemContext).toBe(true);
      expect(strategy.keepSummary).toBe(true);
    });

    it('should handle empty message history', () => {
      const strategy = ContextBudgetManager.getPruningStrategy(['system'], [], 128_000);

      // ratio ≈ 0.000022 → keep-all
      expect(strategy.keepSystemContext).toBe(true);
      expect(strategy.keepSummary).toBe(true);
      expect(strategy.pruneToolDetails).toBe(false);
      expect(strategy.removeOldestFirst).toBe(false);
      expect(strategy.maxMessages).toBe(0);
    });

    it('should handle null message history', () => {
      const strategy = ContextBudgetManager.getPruningStrategy(
        ['system'],
        null as unknown as Array<{ role: string; content: string }>,
        128_000,
      );

      expect(strategy.keepSystemContext).toBe(true);
      expect(strategy.keepSummary).toBe(true);
      expect(strategy.maxMessages).toBe(0);
    });

    it('should scale maxMessages with input message count in light pruning', () => {
      // 20 messages × 'x'.repeat(24000): each = 6000 tokens
      // total = 2 + 120000 = 120002, ratio = 120002/89600 ≈ 1.34 → aggressive
      // Need light pruning: 0.6 <= ratio < 0.8
      // With 100 messages × 'x'.repeat(2400): each = 600 tokens
      // total = 2 + 60000 = 60002, ratio = 60002/89600 ≈ 0.67 → light
      const messages = Array.from({ length: 100 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(2400),
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      // maxMessages = max(10, floor(100 * 0.7)) = max(10, 70) = 70
      expect(strategy.maxMessages).toBe(70);
      expect(strategy.removeOldestFirst).toBe(true);
      expect(strategy.pruneToolDetails).toBe(false);
    });

    it('should enforce minimum maxMessages floor in aggressive pruning', () => {
      // 3 messages with huge content → aggressive pruning
      // maxMessages = max(5, floor(3 * 0.4)) = max(5, 1) = 5
      const messages = Array.from({ length: 3 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(100_000), // 25000 tokens each → total 75002
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      expect(strategy.maxMessages).toBe(5); // floor of 5
      expect(strategy.pruneToolDetails).toBe(true);
    });

    it('should enforce minimum maxMessages floor in light pruning', () => {
      // 5 messages with moderate content → light pruning
      // each: ceil(28000/4) = 7000 tokens, total = 2 + 35000 = 35002
      // ratio = 35002/89600 ≈ 0.39 → keep-all, not light
      // Need ratio >= 0.6: total >= 53760
      // 10 messages × ceil(24000/4) = 6000 → total = 60002 → ratio ≈ 0.67 → light
      // maxMessages = max(10, floor(10 * 0.7)) = 10
      // With 5 messages: maxMessages = max(10, floor(5 * 0.7)) = max(10, 3) = 10
      // That's still 10, which is the floor
      const messages = Array.from({ length: 5 }, () => ({
        role: 'user' as const,
        content: 'x'.repeat(48_000), // 12000 tokens each → total = 60002
      }));

      const strategy = ContextBudgetManager.getPruningStrategy(['system'], messages, 128_000);

      expect(strategy.maxMessages).toBe(10); // min(10, floor(5*0.7)) → max(10, 3) = 10
      expect(strategy.removeOldestFirst).toBe(true);
    });
  });
});
