import { AsqError } from '../domain/query-errors';

/**
 * Counting semaphore with a bounded wait: the per-process cap on database
 * connections ASQ holds at once, so heavy queries cannot drain the pool the
 * rest of the API needs.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<{ resolve: () => void; timer: NodeJS.Timeout }> = [];

  constructor(
    readonly max: number,
    private readonly waitMs: number,
  ) {}

  get inUse(): number {
    return this.active;
  }

  /** Waits for a slot; throws BUSY after `waitMs`. */
  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return this.releaser();
    }
    await new Promise<void>((resolve, reject) => {
      const entry = {
        resolve,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new AsqError('BUSY', 'Too many queries are running, retry shortly'));
        }, this.waitMs),
      };
      this.waiting.push(entry);
    });
    return this.releaser();
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(); // the slot passes straight to the next waiter
      } else {
        this.active--;
      }
    };
  }
}

/** Runs `tasks` with at most `limit` in flight; keeps input order. */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
