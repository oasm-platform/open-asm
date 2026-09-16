import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { FindOperator, type DataSource, type Repository } from 'typeorm';
import { ToolCategory, WorkerType } from '@/common/enums/enum';
import type { RedisLockService } from '@/services/redis/distributed-lock.service';
import type { StorageService } from '../storage/storage.service';
import type { Tool } from './entities/tools.entity';
import type { WorkspaceTool } from './entities/workspace_tools.entity';
import { ToolSyncService } from './tool-sync.service';

// NOTE: module-level `jest.mock('fs/promises')` is unreliable here — the SWC
// transform hoists `require()` above the `jest.mock()` call, so the service
// captures the real module. We instead spy on the shared module object.
const readFileSpy = jest.spyOn(fs, 'readFile');

const map = ToolSyncService.mapConnectorCapabilityToCategory;

const PNG_B64 = Buffer.from('fake-png-bytes').toString('base64');

/** Minimal connector manifest entry with sensible defaults. */
const connector = (over: Record<string, unknown>): Record<string, unknown> => ({
  slug: 'nessus',
  description: 'desc',
  version: '1.0.0',
  author: 'oasm',
  capabilities: ['vulnerabilities'],
  ...over,
});

type Row = Partial<Tool> & { id: string; name?: string };

interface Harness {
  service: ToolSyncService;
  insertCalls: Array<{ values: Row[]; overwrite: string[] }>;
  rowByName: (name: string) => Row | undefined;
  uploadFile: jest.Mock;
  deleteFile: jest.Mock;
  setManifest: (connectors: Array<Record<string, unknown>>) => void;
}

/**
 * In-memory fake of the tools repository. Emulates the two TypeORM behaviours
 * this service depends on: upsert-by-name via QueryBuilder, and `save()`
 * persisting explicit `null` (not undefined). A column omitted from the insert
 * is materialised as SQL NULL, matching the real Postgres column (no DEFAULT).
 */
const createHarness = (): Harness => {
  const db = new Map<string, Row>();
  const insertCalls: Array<{ values: Row[]; overwrite: string[] }> = [];

  const applyInsert = (values: Row[], overwrite: string[]): void => {
    for (const value of values) {
      const existing = [...db.values()].find((r) => r.name === value.name);
      if (existing) {
        for (const key of overwrite) {
          (existing as Record<string, unknown>)[key] = (value as Record<string, unknown>)[key] ?? null;
        }
      } else {
        const created: Row = { ...value };
        if (!('logoUrl' in created)) (created as Record<string, unknown>).logoUrl = null;
        db.set(created.id, created);
      }
    }
  };

  const makeBuilder = (): Record<string, jest.Mock> => {
    let mode: 'insert' | 'delete' | null = null;
    let values: Row[] = [];
    let overwrite: string[] = [];
    const builder: Record<string, jest.Mock> = {};
    builder.insert = jest.fn(() => {
      mode = 'insert';
      return builder;
    });
    builder.delete = jest.fn(() => {
      mode = 'delete';
      return builder;
    });
    builder.orUpdate = jest.fn((opts: { overwrite: string[] }) => {
      overwrite = opts.overwrite;
      return builder;
    });
    builder.values = jest.fn((v: Row[]) => {
      values = v;
      return builder;
    });
    builder.where = jest.fn(() => builder);
    builder.execute = jest.fn(() => {
      if (mode === 'insert') {
        insertCalls.push({ values, overwrite });
        applyInsert(values, overwrite);
      }
      return Promise.resolve({});
    });
    return builder;
  };

  const toolsRepository = {
    find: jest.fn((opts?: { where?: Record<string, unknown> }): Promise<Row[]> => {
      const where = opts?.where ?? {};
      const nameOp = where.name;
      if (nameOp instanceof FindOperator) {
        const names = (nameOp.value as string[]) ?? [];
        return Promise.resolve([...db.values()].filter((r) => r.name !== undefined && names.includes(r.name)));
      }
      let rows = [...db.values()];
      if ('type' in where) rows = rows.filter((r) => r.type === where.type);
      if ('isOfficialSupport' in where) rows = rows.filter((r) => r.isOfficialSupport === where.isOfficialSupport);
      return Promise.resolve(rows);
    }),
    save: jest.fn((entity: Row) => {
      const merged: Row = { ...(db.get(entity.id) ?? {}), ...entity };
      db.set(entity.id, merged);
      return Promise.resolve(merged);
    }),
    createQueryBuilder: jest.fn(() => makeBuilder()),
    delete: jest.fn((arg: string | { id: FindOperator<string> }) => {
      if (typeof arg === 'string') {
        db.delete(arg);
        return Promise.resolve();
      }
      if (arg?.id instanceof FindOperator) {
        for (const id of arg.id.value as string[]) db.delete(id);
      }
      return Promise.resolve();
    }),
  };

  const workspaceToolRepository = {
    manager: { query: jest.fn(() => Promise.resolve([])) },
    createQueryBuilder: jest.fn(() => makeBuilder()),
    delete: jest.fn(() => Promise.resolve(undefined)),
  };

  const redisLockService = {
    withLock: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  };

  const uploadFile = jest.fn(() => Promise.resolve({ path: 'system/connectors/x.png' }));
  const deleteFile = jest.fn(() => Promise.resolve());
  const storageService = { uploadFile, deleteFile };

  const dataSource = { query: jest.fn(() => Promise.resolve([])) };

  const service = new ToolSyncService(
    toolsRepository as unknown as Repository<Tool>,
    workspaceToolRepository as unknown as Repository<WorkspaceTool>,
    redisLockService as unknown as RedisLockService,
    storageService as unknown as StorageService,
    dataSource as unknown as DataSource,
  );

  let manifestRaw = JSON.stringify({ connectors: [] });
  readFileSpy.mockImplementation(() => Promise.resolve(manifestRaw));

  return {
    service,
    insertCalls,
    rowByName: (name: string): Row | undefined => [...db.values()].find((r) => r.name === name),
    uploadFile,
    deleteFile,
    setManifest: (connectors: Array<Record<string, unknown>>) => {
      manifestRaw = JSON.stringify({ connectors });
    },
  };
};

const runConnectorSync = (service: ToolSyncService): Promise<Tool[]> =>
  (service as unknown as { syncConnectorTools: () => Promise<Tool[]> }).syncConnectorTools();

describe('ToolSyncService.mapConnectorCapabilityToCategory', () => {
  describe('url_discovery (happy path)', () => {
    it('maps ["url_discovery"] to URL_DISCOVERY', () => {
      // Arrange
      const capabilities: string[] = ['url_discovery'];

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(ToolCategory.URL_DISCOVERY);
    });

    it('maps the capability case-insensitively (["URL_DISCOVERY"])', () => {
      // Arrange
      const capabilities: string[] = ['URL_DISCOVERY'];

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(ToolCategory.URL_DISCOVERY);
    });
  });

  describe('edge cases', () => {
    it('maps undefined capabilities to VULNERABILITIES', () => {
      // Arrange
      const capabilities: string[] | undefined = undefined;

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(ToolCategory.VULNERABILITIES);
    });

    it('maps an empty capability list to VULNERABILITIES', () => {
      // Arrange
      const capabilities: string[] = [];

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(ToolCategory.VULNERABILITIES);
    });

    it('maps an unknown capability to VULNERABILITIES', () => {
      // Arrange
      const capabilities: string[] = ['unknown_cap'];

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(ToolCategory.VULNERABILITIES);
    });
  });

  describe('regression: existing capability mapping is unchanged', () => {
    it.each<[string, ToolCategory]>([
      ['subdomains', ToolCategory.SUBDOMAINS],
      ['http_probe', ToolCategory.HTTP_PROBE],
      ['ports_scanner', ToolCategory.PORTS_SCANNER],
      ['port_scanner', ToolCategory.PORTS_SCANNER],
      ['vulnerabilities', ToolCategory.VULNERABILITIES],
      ['screenshot', ToolCategory.SCREENSHOT],
    ])('maps "%s" to "%s"', (capability, expected) => {
      // Arrange
      const capabilities: string[] = [capability];

      // Act
      const category: ToolCategory | undefined = map(capabilities);

      // Assert
      expect(category).toBe(expected);
    });
  });
});

describe('ToolSyncService connector logo synchronization', () => {
  let warnSpy: jest.SpyInstance;
  let loggerSpies: jest.SpyInstance[];

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    loggerSpies = [
      warnSpy,
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
    ];
    // Re-arm the module-level fs spy (never restoreAllMocks — that would also
    // restore readFileSpy and make the service read the real manifest).
    readFileSpy.mockReset();
  });

  afterEach(() => {
    for (const spy of loggerSpies) spy.mockRestore();
  });

  it('S1: connector without logo gets NULL logoUrl and no upload', async () => {
    // Arrange
    const h = createHarness();
    h.setManifest([connector({ slug: 'gau' })]);

    // Act
    await runConnectorSync(h.service);

    // Assert
    const gau = h.rowByName('gau');
    expect(gau).toBeDefined();
    expect(gau!.logoUrl).toBeNull();
    expect(gau!.logoUrl).not.toBe('');
    expect(h.uploadFile).not.toHaveBeenCalled();
  });

  it('S2: connector with logo keeps the /connectors path and uploads the PNG once', async () => {
    // Arrange
    const h = createHarness();
    h.setManifest([connector({ slug: 'nessus', logo: PNG_B64 })]);

    // Act
    await runConnectorSync(h.service);

    // Assert
    expect(h.rowByName('nessus')!.logoUrl).toBe('/connectors/nessus.png');
    expect(h.uploadFile).toHaveBeenCalledTimes(1);
    expect(h.uploadFile).toHaveBeenCalledWith('connectors/nessus.png', expect.any(Buffer), 'system');
  });

  it('S3: logo removed between syncs clears the column and deletes the stored object once', async () => {
    // Arrange
    const h = createHarness();
    h.setManifest([connector({ slug: 'nessus', logo: PNG_B64 })]);
    await runConnectorSync(h.service);
    expect(h.rowByName('nessus')!.logoUrl).toBe('/connectors/nessus.png');
    h.uploadFile.mockClear();
    h.deleteFile.mockClear();
    h.setManifest([connector({ slug: 'nessus' })]);

    // Act
    await runConnectorSync(h.service);

    // Assert
    expect(h.rowByName('nessus')!.logoUrl).toBeNull();
    expect(h.deleteFile).toHaveBeenCalledTimes(1);
    expect(h.deleteFile).toHaveBeenCalledWith('connectors/nessus.png', 'system');
  });

  it('S4: repeated logo-less sync is idempotent and built-in logo paths are untouched', async () => {
    // Arrange
    const h = createHarness();
    h.setManifest([connector({ slug: 'gau' })]);

    // Act
    await h.service.onModuleInit();

    // Assert (built-in regression)
    const builtInInsert = h.insertCalls.find((c) => c.values.some((v) => v.type === WorkerType.BUILT_IN));
    expect(builtInInsert).toBeDefined();
    expect(builtInInsert!.values.find((v) => v.name === 'subfinder')!.logoUrl).toBe('/static/images/subfinder.png');
    expect(h.rowByName('gau')!.logoUrl).toBeNull();
    expect(h.deleteFile).not.toHaveBeenCalled();

    // Act (second, identical sync)
    await h.service.onModuleInit();

    // Assert (no spurious delete, row unchanged)
    expect(h.deleteFile).not.toHaveBeenCalled();
    expect(h.rowByName('gau')!.logoUrl).toBeNull();
  });

  it('S5: storage delete failure is swallowed, row still cleared, warn logged', async () => {
    // Arrange
    const h = createHarness();
    h.setManifest([connector({ slug: 'nessus', logo: PNG_B64 })]);
    await runConnectorSync(h.service);
    h.deleteFile.mockRejectedValueOnce(new Error('boom'));
    h.setManifest([connector({ slug: 'nessus' })]);

    // Act / Assert (must not reject)
    await expect(runConnectorSync(h.service)).resolves.toBeDefined();
    expect(h.rowByName('nessus')!.logoUrl).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete connector logo for nessus'));
  });
});
