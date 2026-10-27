import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import { ArtifactQuotaService, STORAGE_QUOTA_EXCEEDED } from './artifact-quota.service';

/** A chainable query-builder stub whose `execute` resolves to `result`. */
const queryBuilder = (result: unknown) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'insert',
    'into',
    'values',
    'orIgnore',
    'orUpdate',
    'update',
    'set',
    'where',
    'andWhere',
    'setParameters',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.execute = jest.fn().mockResolvedValue(result);
  return qb;
};

describe('ArtifactQuotaService', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  const build = (dataSource: Partial<DataSource> = {}, env = {}) =>
    new ArtifactQuotaService(dataSource as DataSource, config(env));

  it('falls back to the default limits for missing or invalid env values', () => {
    expect(build({}, { ARTIFACT_MAX_FILE_BYTES: 'abc' }).maxFileBytes).toBe(
      50 * 1024 * 1024,
    );
    expect(build({}, { ARTIFACT_MAX_FILE_BYTES: '10' }).maxFileBytes).toBe(10);
  });

  it('rejects a file over the per-file limit', () => {
    const service = build({}, { ARTIFACT_MAX_FILE_BYTES: '10' });
    expect(() => service.assertFileSize(10)).not.toThrow();
    expect(() => service.assertFileSize(11)).toThrow();
  });

  describe('reserve', () => {
    it('creates the usage row and reserves with a conditional update', async () => {
      const upsert = queryBuilder({});
      const update = queryBuilder({ affected: 1 });
      const manager = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(upsert)
          .mockReturnValueOnce(update),
      };

      await build({}, { ARTIFACT_WORKSPACE_QUOTA_BYTES: '500' }).reserve(
        manager as unknown as EntityManager,
        'ws-1',
        100,
      );

      expect(upsert.orIgnore).toHaveBeenCalled();
      expect(update.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('<= COALESCE("quotaBytes", :defaultQuota)'),
      );
      expect(update.setParameters).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        bytes: 100,
        defaultQuota: 500,
      });
    });

    it('throws 409 STORAGE_QUOTA_EXCEEDED when no row could be updated', async () => {
      const manager = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(queryBuilder({}))
          .mockReturnValueOnce(queryBuilder({ affected: 0 })),
      };

      const error = await build()
        .reserve(manager as unknown as EntityManager, 'ws-1', 100)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: STORAGE_QUOTA_EXCEEDED,
      });
    });
  });

  it('commit moves bytes from reserved to used without going negative', async () => {
    const update = queryBuilder({ affected: 1 });
    const manager = { createQueryBuilder: jest.fn(() => update) };

    await build().commit(manager as unknown as EntityManager, 'ws-1', 40);

    expect(update.set).toHaveBeenCalledWith({
      reservedBytes: expect.any(Function),
      usedBytes: expect.any(Function),
    });
    const set = update.set.mock.calls[0][0] as Record<string, () => string>;
    expect(set.reservedBytes()).toContain('GREATEST');
    expect(update.setParameters).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      reserved: -40,
      used: 40,
    });
  });

  it('setQuota returns 404 for an unknown workspace', async () => {
    const dataSource = {
      getRepository: jest.fn(() => ({ existsBy: jest.fn().mockResolvedValue(false) })),
    };
    await expect(
      build(dataSource as unknown as DataSource).setQuota('ws-1', 10),
    ).rejects.toThrow(NotFoundException);
  });

  it('setQuota upserts the override', async () => {
    const upsert = queryBuilder({});
    const dataSource = {
      getRepository: jest.fn(() => ({ existsBy: jest.fn().mockResolvedValue(true) })),
      createQueryBuilder: jest.fn(() => upsert),
    };

    await expect(
      build(dataSource as unknown as DataSource).setQuota('ws-1', null),
    ).resolves.toEqual({ workspaceId: 'ws-1', quotaBytes: null });
    expect(upsert.values).toHaveBeenCalledWith({ workspaceId: 'ws-1', quotaBytes: null });
    expect(upsert.orUpdate).toHaveBeenCalledWith(
      ['quotaBytes', 'updatedAt'],
      ['workspaceId'],
    );
  });
});
