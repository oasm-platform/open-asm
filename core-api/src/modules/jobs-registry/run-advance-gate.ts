/**
 * In-process admission for run advances.
 *
 * An advance holds a pooled connection for its transaction while it waits for
 * the run's row lock, and needs more connections from the same pool while it
 * holds that lock (scope loading, config resolution). Left unbounded, a burst
 * of finishing jobs filled the pool with advances queued on one run's lock,
 * and the advance holding the lock waited forever for a connection.
 *
 * `limit` caps how many advances hold a connection at once on this instance.
 * `coalesce` keeps at most one advance per run in flight here: a request that
 * arrives meanwhile only asks for one more pass, which starts after the
 * current one and so sees every job committed before the request was made.
 * Nothing is persisted: across instances the run's row lock still serializes.
 */
export class RunAdvanceGate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly flights = new Map<string, { again: boolean }>();

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error(`maxConcurrent must be a positive integer, got ${maxConcurrent}`);
    }
  }

  /**
   * Runs `work` for `key`, or folds this request into the pass already in
   * flight for it. Resolves once this instance has no pass pending for the
   * key that started before the request; rejects with the last failure of a
   * pass it owned (the extra passes still run).
   */
  async coalesce(key: string, work: () => Promise<void>): Promise<void> {
    const flight = this.flights.get(key);
    if (flight) {
      flight.again = true;
      return;
    }

    const state = { again: false };
    this.flights.set(key, state);
    let failure: { error: unknown } | undefined;
    try {
      do {
        state.again = false;
        try {
          await this.limit(work);
        } catch (error) {
          failure = { error };
        }
      } while (state.again);
    } finally {
      this.flights.delete(key);
    }
    if (failure) throw failure.error;
  }

  /** Runs `work` once fewer than `maxConcurrent` others are running. */
  async limit<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((admit) => this.waiting.push(admit));
    } else {
      this.active++;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        // The slot passes straight to the next waiter.
        next();
      } else {
        this.active--;
      }
    }
  }
}
