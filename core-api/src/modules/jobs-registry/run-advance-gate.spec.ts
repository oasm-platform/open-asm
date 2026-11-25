import { RunAdvanceGate } from './run-advance-gate';

/** A promise the test resolves by hand. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets every pending microtask and timer-free continuation run. */
const settle = () => new Promise((done) => setImmediate(done));

describe('RunAdvanceGate', () => {
  describe('coalesce', () => {
    it('runs a single pass for a run nobody else is advancing', async () => {
      // Given
      const gate = new RunAdvanceGate(4);
      const work = jest.fn().mockResolvedValue(undefined);

      // When
      await gate.coalesce('run-1', work);

      // Then
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('folds every request that arrives during a pass into one more pass', async () => {
      // Given: a pass in flight
      const gate = new RunAdvanceGate(4);
      const first = deferred();
      const work = jest
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValue(undefined);
      const running = gate.coalesce('run-1', work);
      await settle();

      // When: three more requests for the same run arrive meanwhile
      const late = Promise.all([
        gate.coalesce('run-1', work),
        gate.coalesce('run-1', work),
        gate.coalesce('run-1', work),
      ]);
      await late;
      first.resolve();
      await running;

      // Then: the late requests return at once, and cost one extra pass
      expect(work).toHaveBeenCalledTimes(2);
    });

    it('starts the extra pass only after the pass in flight finished', async () => {
      // Given
      const gate = new RunAdvanceGate(4);
      const first = deferred();
      const events: string[] = [];
      const work = jest
        .fn()
        .mockImplementationOnce(async () => {
          events.push('first:start');
          await first.promise;
          events.push('first:end');
        })
        .mockImplementation(() => {
          events.push('second:start');
          return Promise.resolve();
        });
      const running = gate.coalesce('run-1', work);
      await settle();

      // When
      await gate.coalesce('run-1', work);
      first.resolve();
      await running;

      // Then
      expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    });

    it('advances different runs independently', async () => {
      // Given
      const gate = new RunAdvanceGate(4);
      const first = deferred();
      const work = jest.fn(() => first.promise);

      // When
      const a = gate.coalesce('run-1', work);
      const b = gate.coalesce('run-2', work);
      await settle();

      // Then: both are in flight at once
      expect(work).toHaveBeenCalledTimes(2);
      first.resolve();
      await Promise.all([a, b]);
    });

    it('still runs the requested extra pass when the pass in flight fails', async () => {
      // Given
      const gate = new RunAdvanceGate(4);
      const first = deferred();
      const work = jest
        .fn()
        .mockImplementationOnce(async () => {
          await first.promise;
          throw new Error('advance failed');
        })
        .mockResolvedValue(undefined);
      const running = gate.coalesce('run-1', work);
      await settle();

      // When
      await gate.coalesce('run-1', work);
      first.resolve();

      // Then: the failure reaches the caller that owned the pass, and the
      // request that arrived meanwhile is not lost
      await expect(running).rejects.toThrow('advance failed');
      expect(work).toHaveBeenCalledTimes(2);
    });

    it('accepts a new request once the run is idle again', async () => {
      // Given
      const gate = new RunAdvanceGate(4);
      const work = jest.fn().mockResolvedValue(undefined);
      await gate.coalesce('run-1', work);

      // When
      await gate.coalesce('run-1', work);

      // Then
      expect(work).toHaveBeenCalledTimes(2);
    });
  });

  describe('limit', () => {
    it('never runs more than the limit at once', async () => {
      // Given: a limit of two and five passes for five runs
      const gate = new RunAdvanceGate(2);
      const release = deferred();
      let active = 0;
      let peak = 0;
      const work = async () => {
        active++;
        peak = Math.max(peak, active);
        await release.promise;
        active--;
      };

      // When
      const all = Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((run) => gate.coalesce(run, work)),
      );
      await settle();
      const startedBeforeRelease = active;
      release.resolve();
      await all;

      // Then
      expect(startedBeforeRelease).toBe(2);
      expect(peak).toBe(2);
    });

    it('frees its slot when a pass throws', async () => {
      // Given
      const gate = new RunAdvanceGate(1);
      await expect(
        gate.limit(() => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom');

      // When
      const work = jest.fn().mockResolvedValue('ok');
      const result = await gate.limit(work);

      // Then
      expect(result).toBe('ok');
    });

    it('rejects a limit below one', () => {
      expect(() => new RunAdvanceGate(0)).toThrow();
    });
  });
});
