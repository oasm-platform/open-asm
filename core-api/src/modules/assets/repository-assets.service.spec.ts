import type { Repository } from 'typeorm';
import { In } from 'typeorm';
import type { Asset, RepositoryAssetMetadata } from './entities/assets.entity';
import { RepositoryAssetsService } from './repository-assets.service';

const metadata = (remoteId: string) =>
  ({ provider: 'github', remoteId }) as unknown as RepositoryAssetMetadata;

describe('RepositoryAssetsService', () => {
  let writes: { update: jest.Mock; insert: jest.Mock };
  let repo: { find: jest.Mock; manager: { transaction: jest.Mock } };
  let service: RepositoryAssetsService;

  beforeEach(() => {
    writes = { update: jest.fn(), insert: jest.fn() };
    repo = {
      find: jest.fn().mockResolvedValue([]),
      manager: {
        transaction: jest.fn((fn: (m: unknown) => Promise<unknown>) =>
          fn({ getRepository: () => writes }),
        ),
      },
    };
    service = new RepositoryAssetsService(repo as unknown as Repository<Asset>);
  });

  it('lists the assets of a target with the fields a sync compares', async () => {
    await service.list('target-1');

    expect(repo.find).toHaveBeenCalledWith({
      where: { targetId: 'target-1' },
      select: { id: true, value: true, isEnabled: true, metadata: true },
    });
  });

  it('applies renames, then updates, then inserts, then disables, in one transaction', async () => {
    await service.apply('target-1', {
      renames: [{ id: 'a-old', value: 'github.com/acme/web~1' }],
      updates: [
        { id: 'a-1', value: 'github.com/acme/web', isEnabled: true, metadata: metadata('1') },
      ],
      inserts: [{ value: 'github.com/acme/api', isEnabled: false, metadata: metadata('2') }],
      disableIds: ['a-gone'],
    });

    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(writes.update.mock.calls).toEqual([
      ['a-old', { value: 'github.com/acme/web~1' }],
      ['a-1', { value: 'github.com/acme/web', isEnabled: true, metadata: metadata('1') }],
      [{ id: In(['a-gone']) }, { isEnabled: false }],
    ]);
    expect(writes.insert).toHaveBeenCalledWith([
      {
        value: 'github.com/acme/api',
        isEnabled: false,
        isPrimary: false,
        metadata: metadata('2'),
        targetId: 'target-1',
      },
    ]);
    // The disable runs after the insert
    expect(writes.insert.mock.invocationCallOrder[0]).toBeLessThan(
      writes.update.mock.invocationCallOrder[2],
    );
  });

  it('inserts in chunks of 200', async () => {
    const inserts = Array.from({ length: 450 }, (_, i) => ({
      value: `github.com/acme/r${i}`,
      isEnabled: true,
      metadata: metadata(String(i)),
    }));

    await service.apply('target-1', { renames: [], updates: [], inserts, disableIds: [] });

    expect(writes.insert.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([
      200, 200, 50,
    ]);
    expect(writes.update).not.toHaveBeenCalled();
  });
});
