import { AliveStreamManager } from './alive-stream-manager.service';

describe('AliveStreamManager', () => {
  let service: AliveStreamManager;

  beforeEach(() => {
    service = new AliveStreamManager();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a worker stream and return a streamId', () => {
      const streamId = service.register('worker-1', 'token-1');

      expect(streamId).toBeDefined();
      expect(typeof streamId).toBe('string');
      expect(service.isActive('worker-1')).toBe(true);
      expect(service.getActiveStreamCount()).toBe(1);
    });

    it('should return unique streamIds for each registration', () => {
      const id1 = service.register('worker-1', 'token-1');
      const id2 = service.register('worker-2', 'token-2');

      expect(id1).not.toBe(id2);
    });

    it('should overwrite existing registration for same worker', () => {
      service.register('worker-1', 'token-1');
      const secondStreamId = service.register('worker-1', 'token-2');

      expect(service.isActive('worker-1')).toBe(true);
      expect(service.getActiveStreamCount()).toBe(1);
      expect(service.getMetadata('worker-1')?.workerToken).toBe('token-2');
      expect(service.getMetadata('worker-1')?.streamId).toBe(secondStreamId);
    });

    it('should store connectedAt and lastAliveAt timestamps', () => {
      const before = new Date();
      service.register('worker-1', 'token-1');
      const after = new Date();

      const metadata = service.getMetadata('worker-1');
      expect(metadata).toBeDefined();
      expect(metadata!.connectedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(metadata!.connectedAt.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
      expect(metadata!.lastAliveAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });

  describe('unregister', () => {
    it('should remove a registered worker stream when streamId matches', () => {
      const streamId = service.register('worker-1', 'token-1');
      service.unregister('worker-1', streamId);

      expect(service.isActive('worker-1')).toBe(false);
      expect(service.getActiveStreamCount()).toBe(0);
    });

    it('should NOT remove when streamId does not match (stale teardown)', () => {
      const oldStreamId = service.register('worker-1', 'token-1');
      const newStreamId = service.register('worker-1', 'token-2');

      // Old stream teardown tries to unregister with old streamId
      service.unregister('worker-1', oldStreamId);

      // New stream should still be active
      expect(service.isActive('worker-1')).toBe(true);
      expect(service.getMetadata('worker-1')?.streamId).toBe(newStreamId);
    });

    it('should not throw when unregistering unknown worker', () => {
      expect(() =>
        service.unregister('unknown-worker', 'stream-999'),
      ).not.toThrow();
    });
  });

  describe('isActive', () => {
    it('should return true for registered worker', () => {
      service.register('worker-1', 'token-1');
      expect(service.isActive('worker-1')).toBe(true);
    });

    it('should return false for unregistered worker', () => {
      expect(service.isActive('unknown-worker')).toBe(false);
    });

    it('should return false after unregister with correct streamId', () => {
      const streamId = service.register('worker-1', 'token-1');
      service.unregister('worker-1', streamId);
      expect(service.isActive('worker-1')).toBe(false);
    });
  });

  describe('updateAlive', () => {
    it('should update lastAliveAt for registered worker', () => {
      service.register('worker-1', 'token-1');
      const initialAlive = service.getMetadata('worker-1')!.lastAliveAt;

      service.updateAlive('worker-1');

      const updatedAlive = service.getMetadata('worker-1')!.lastAliveAt;
      expect(updatedAlive.getTime()).toBeGreaterThanOrEqual(
        initialAlive.getTime(),
      );
    });

    it('should not throw when updating unknown worker', () => {
      expect(() => service.updateAlive('unknown-worker')).not.toThrow();
    });
  });

  describe('getActiveWorkerIds', () => {
    it('should return empty set when no workers registered', () => {
      const ids = service.getActiveWorkerIds();
      expect(ids.size).toBe(0);
    });

    it('should return all registered worker ids', () => {
      service.register('worker-1', 'token-1');
      service.register('worker-2', 'token-2');
      service.register('worker-3', 'token-3');

      const ids = service.getActiveWorkerIds();
      expect(ids.size).toBe(3);
      expect(ids.has('worker-1')).toBe(true);
      expect(ids.has('worker-2')).toBe(true);
      expect(ids.has('worker-3')).toBe(true);
    });

    it('should not include unregistered workers', () => {
      const streamId = service.register('worker-1', 'token-1');
      service.register('worker-2', 'token-2');
      service.unregister('worker-1', streamId);

      const ids = service.getActiveWorkerIds();
      expect(ids.size).toBe(1);
      expect(ids.has('worker-2')).toBe(true);
    });
  });

  describe('getActiveStreamCount', () => {
    it('should return 0 when empty', () => {
      expect(service.getActiveStreamCount()).toBe(0);
    });

    it('should track count correctly', () => {
      service.register('worker-1', 'token-1');
      expect(service.getActiveStreamCount()).toBe(1);

      service.register('worker-2', 'token-2');
      expect(service.getActiveStreamCount()).toBe(2);

      const streamId = service.register('worker-1', 'token-1-new');
      service.unregister('worker-1', streamId);
      expect(service.getActiveStreamCount()).toBe(1);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for registered worker', () => {
      service.register('worker-1', 'token-1');
      const metadata = service.getMetadata('worker-1');

      expect(metadata).toBeDefined();
      expect(metadata!.workerToken).toBe('token-1');
      expect(metadata!.connectedAt).toBeInstanceOf(Date);
      expect(metadata!.lastAliveAt).toBeInstanceOf(Date);
      expect(metadata!.streamId).toBeDefined();
    });

    it('should return undefined for unknown worker', () => {
      expect(service.getMetadata('unknown-worker')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should remove all registered streams', () => {
      service.register('worker-1', 'token-1');
      service.register('worker-2', 'token-2');
      service.register('worker-3', 'token-3');

      service.clear();

      expect(service.getActiveStreamCount()).toBe(0);
      expect(service.isActive('worker-1')).toBe(false);
      expect(service.isActive('worker-2')).toBe(false);
      expect(service.isActive('worker-3')).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all streams on module destroy', () => {
      service.register('worker-1', 'token-1');
      service.register('worker-2', 'token-2');

      service.onModuleDestroy();

      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('duplicate stream handling (race condition)', () => {
    it('should not remove new stream when old stream teardown runs', () => {
      // Simulate rapid reconnect scenario:
      // 1. Old stream registers
      const oldStreamId = service.register('worker-1', 'token-1');

      // 2. Worker reconnects, new stream registers (old teardown hasn't run yet)
      const newStreamId = service.register('worker-1', 'token-1');

      // 3. Old stream teardown fires (with stale streamId)
      service.unregister('worker-1', oldStreamId);

      // New stream should still be active
      expect(service.isActive('worker-1')).toBe(true);
      expect(service.getMetadata('worker-1')?.streamId).toBe(newStreamId);

      // 4. New stream teardown fires (correct streamId)
      service.unregister('worker-1', newStreamId);
      expect(service.isActive('worker-1')).toBe(false);
    });

    it('should handle three rapid reconnects correctly', () => {
      const id1 = service.register('worker-1', 'token-1');
      const id2 = service.register('worker-1', 'token-2');
      const id3 = service.register('worker-1', 'token-3');

      // Old teardowns fire out of order
      service.unregister('worker-1', id1); // stale, skip
      expect(service.isActive('worker-1')).toBe(true);
      expect(service.getMetadata('worker-1')?.streamId).toBe(id3);

      service.unregister('worker-1', id2); // stale, skip
      expect(service.isActive('worker-1')).toBe(true);

      service.unregister('worker-1', id3); // current, remove
      expect(service.isActive('worker-1')).toBe(false);
    });
  });
});
