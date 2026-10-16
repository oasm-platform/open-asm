import type { EntityManager } from 'typeorm';
import {
  type ConversationMetadata,
  mergeConversationMetadata,
  updateConversationMetadata,
} from './conversation-metadata';

describe('conversation metadata', () => {
  const now = new Date('2026-10-15T00:00:00.000Z');

  it('patches fields without touching totals when there is no delta', () => {
    const next = mergeConversationMetadata(
      { model: 'old', totals: { inputTokens: 1, outputTokens: 1, costUsd: 1, costComplete: true, turns: 1 } },
      { model: 'new', contextWindow: 200_000 },
      undefined,
      now,
    );
    expect(next.model).toBe('new');
    expect(next.contextWindow).toBe(200_000);
    expect(next.totals?.turns).toBe(1);
    expect(next.updatedAt).toBe(now.toISOString());
  });

  it('adds token and cost deltas, counting turns only when asked', () => {
    let meta = mergeConversationMetadata(null, {}, {
      inputTokens: 100,
      outputTokens: 10,
      costUsd: 0.5,
      countTurn: true,
    });
    meta = mergeConversationMetadata(meta, {}, {
      inputTokens: 50,
      outputTokens: 5,
      costUsd: 0.25,
      countTurn: false,
    });
    expect(meta.totals).toEqual({
      inputTokens: 150,
      outputTokens: 15,
      costUsd: 0.75,
      costComplete: true,
      turns: 1,
    });
  });

  it('marks the cost incomplete once a run had no price', () => {
    const meta = mergeConversationMetadata(null, {}, {
      inputTokens: 1,
      outputTokens: 1,
      costUsd: null,
      countTurn: true,
    });
    expect(meta.totals?.costComplete).toBe(false);
    expect(meta.totals?.costUsd).toBe(0);
  });

  it('updates under a row lock and returns null for a missing conversation', async () => {
    const stored: ConversationMetadata = { model: 'm' };
    const m = {
      findOne: jest.fn((_entity: unknown, opts: { where: { id: string } }) =>
        Promise.resolve(
          opts.where.id === 'c1' ? { id: 'c1', metadata: stored } : null,
        ),
      ),
      update: jest.fn(() => Promise.resolve()),
    };
    const manager = {
      transaction: jest.fn((fn: (tx: typeof m) => unknown) => fn(m)),
    } as unknown as EntityManager;

    const next = await updateConversationMetadata(manager, 'c1', {
      contextUsedTokens: 42,
    });
    expect(next).toMatchObject({ model: 'm', contextUsedTokens: 42 });
    expect(m.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(m.update).toHaveBeenCalledTimes(1);

    await expect(
      updateConversationMetadata(manager, 'missing', {}),
    ).resolves.toBeNull();
    expect(m.update).toHaveBeenCalledTimes(1);
  });
});
