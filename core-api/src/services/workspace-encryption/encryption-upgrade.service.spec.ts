import { encrypt } from '@/common/utils/encryption.util';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import type { DataSource } from 'typeorm';
import { EncryptionUpgradeService } from './encryption-upgrade.service';
import type { WorkspaceEncryptionService } from './workspace-encryption.service';

describe('EncryptionUpgradeService', () => {
  beforeEach(() => {
    jest.spyOn(RedisLockService, 'current', 'get').mockReturnValue({
      withLock: (_key: string, _ttl: number, action: () => Promise<unknown>) =>
        action(),
    } as unknown as RedisLockService);
  });

  it('re-encrypts job configs, reaching their workspace through the asset target', async () => {
    // Encrypted with the KEK although the workspace has a DEK: rewritten.
    const stored = { apiKey: encrypt('k'), rate: 5 };
    const query = jest.fn((sql: string): Promise<unknown> => {
      if (sql.includes('FROM jobs')) {
        return Promise.resolve([{ id: 'job-1', workspaceId: 'ws-1', value: stored }]);
      }
      if (sql.startsWith('UPDATE "jobs"')) return Promise.resolve([[], 1]);
      return Promise.resolve([]);
    });
    const service = new EncryptionUpgradeService(
      { query } as unknown as DataSource,
      {
        getDEK: jest.fn().mockResolvedValue(Buffer.alloc(32)),
      } as unknown as WorkspaceEncryptionService,
    );

    const counts = await service.upgrade();

    const jobsSelect = query.mock.calls.find(([sql]) => sql.includes('FROM jobs'));
    expect(jobsSelect?.[0]).toMatch(/JOIN targets/);
    const update = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE "jobs"'));
    expect(update).toBeDefined();
    expect(counts?.reencrypted).toBe(1);
  });
});
