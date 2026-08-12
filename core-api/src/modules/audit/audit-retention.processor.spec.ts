import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditRetentionService } from './audit-retention.service';
import type { AuditEvent } from './entities/audit-event.entity';
import { AuditRetentionProcessor } from './processors/audit-retention.processor';

/**
 * Scenario 8 (plan §9): retention processor + JSONL archive.
 *
 * - rows outside the 90-day window are archived to JSONL and deleted (with the
 *   append-only GUC set inside the same transaction, before the first DELETE)
 * - rows inside the window are never touched (the SQL predicate filters them
 *   out; the service only archives/deletes what the query returns)
 * - a write failure aborts before ANY delete
 * - the daily repeat schedule ('0 1 * * *', attempts 3) is registered on init
 * - the archive is idempotent: a persisted watermark (max archived
 *   occurredAt+id, watermark.json under AUDIT_ARCHIVE_DIR) makes the next run
 *   fetch only rows AFTER the watermark via a keyset predicate — offset
 *   pagination is gone
 * - archive dir is 0o700, archive/watermark files are 0o600
 */
describe('AuditRetentionService', () => {
  const WINDOW_SQL = "ae.occurredAt < now() - interval '90 days'";
  const SET_GUC_SQL = "SELECT set_config('app.audit_retention', 'on', true)";
  const BATCH = 5000;

  let archiveDir: string;
  let queueMock: { add: jest.Mock };
  let manager: { query: jest.Mock };
  let dataSourceMock: { transaction: jest.Mock };
  let qbMock: Record<string, jest.Mock>;
  let repoMock: { createQueryBuilder: jest.Mock };
  let service: AuditRetentionService;
  let errorSpy: jest.SpyInstance;

  /** Old row — occurredAt outside the 90-day window (today: 2026-08-11). */
  const oldRow = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'evt-old-1',
      workspaceId: 'ws-1',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      actorId: 'user-1',
      actorType: 'user',
      actorName: 'alice',
      actorEmail: 'alice@example.com',
      action: 'workspace.deleted',
      resourceType: 'workspace',
      resourceId: 'ws-1',
      outcome: 'success',
      changes: {},
      metadata: {},
      ...overrides,
    }) as unknown as AuditEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    archiveDir = mkdtempSync(join(tmpdir(), 'audit-retention-'));
    process.env.AUDIT_ARCHIVE_DIR = archiveDir;

    queueMock = {
      add: jest.fn().mockResolvedValue({ repeatJobKey: 'repeat:audit-retention:1' }),
    };
    manager = { query: jest.fn() };
    dataSourceMock = { transaction: jest.fn() };
    dataSourceMock.transaction.mockImplementation(
      (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
    );
    qbMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    repoMock = { createQueryBuilder: jest.fn().mockReturnValue(qbMock) };

    service = new AuditRetentionService(
      queueMock as unknown as Queue,
      dataSourceMock as unknown as DataSource,
      repoMock as unknown as Repository<AuditEvent>,
    );
  });

  afterEach(() => {
    rmSync(archiveDir, { recursive: true, force: true });
    delete process.env.AUDIT_ARCHIVE_DIR;
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('SC-RET-1: archive + delete happy path (keyset, watermark persisted)', () => {
    it('archives rows older than 90 days to per-day JSONL, persists the watermark, then deletes them inside a tx that sets the GUC before the first DELETE', async () => {
      const rowA = oldRow({ id: 'evt-old-1', action: 'workspace.deleted' });
      const rowB = oldRow({
        id: 'evt-old-2',
        occurredAt: new Date('2026-01-02T00:00:00.000Z'),
        action: 'member.removed',
      });
      qbMock.getMany
        .mockResolvedValueOnce([rowA, rowB])
        .mockResolvedValueOnce([]);

      // DELETE batches: first returns exactly BATCH (loop continues), second
      // returns fewer (loop ends).
      const sqlCalls: string[] = [];
      let deleteCount = 0;
      manager.query.mockImplementation((sql: string) => {
        sqlCalls.push(sql);
        if (sql.startsWith('SELECT set_config')) return [];
        deleteCount += 1;
        return [[], deleteCount === 1 ? BATCH : 2];
      });

      const result = await service.runRetention();

      // JSONL archive: one JSON object per line, full rows, per-day files.
      expect(result).toEqual({ archived: 2, deleted: BATCH + 2 });
      for (const [file, row] of [
        ['audit-2026-01-01.jsonl', rowA],
        ['audit-2026-01-02.jsonl', rowB],
      ] as const) {
        const path = join(archiveDir, file);
        expect(existsSync(path)).toBe(true);
        const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]) as AuditEvent;
        expect(parsed.id).toBe(row.id);
        expect(parsed.action).toBe(row.action);
      }

      // The query is window-scoped: only rows older than 90 days are fetched.
      expect(repoMock.createQueryBuilder).toHaveBeenCalledWith('ae');
      expect(qbMock.where).toHaveBeenCalledWith(WINDOW_SQL);
      expect(qbMock.take).toHaveBeenCalledWith(BATCH);
      // First page (no watermark file yet) → no keyset condition. The keyset
      // appears only from the SECOND page, carrying the advanced watermark.
      expect(qbMock.andWhere).toHaveBeenCalledTimes(1);
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        '(ae.occurredAt, ae.id) > (:wmTs, :wmId)',
        expect.objectContaining({
          wmTs: new Date('2026-01-02T00:00:00.000Z'),
          wmId: 'evt-old-2',
        }),
      );

      // Watermark persisted: max archived (occurredAt, id) = last row of the
      // last batch (rows are ordered ASC).
      const watermark = JSON.parse(
        readFileSync(join(archiveDir, 'watermark.json'), 'utf8'),
      ) as { occurredAt: string; id: string };
      expect(watermark).toEqual({
        occurredAt: '2026-01-02T00:00:00.000Z',
        id: 'evt-old-2',
      });

      // Deletion runs inside ONE explicit transaction; the append-only GUC is
      // set BEFORE the first DELETE (otherwise the trigger raises).
      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(sqlCalls[0]).toBe(SET_GUC_SQL);
      expect(sqlCalls).toHaveLength(3); // GUC + 2 delete batches
      for (const sql of sqlCalls.slice(1)) {
        expect(sql).toContain('DELETE FROM "audit_events"');
        expect(sql).toContain("now() - interval '90 days'");
        expect(sql).toContain('LIMIT 5000');
      }
    });

    it('never touches rows inside the retention window: the SQL filter keeps them out of archive and delete', async () => {
      const recent = oldRow({
        id: 'evt-fresh-1',
        occurredAt: new Date('2026-08-01T00:00:00.000Z'),
        action: 'workspace.created',
      });
      // The query (mocked here) only returns old rows — as the SQL predicate
      // guarantees in production.
      qbMock.getMany.mockResolvedValueOnce([oldRow()]).mockResolvedValueOnce([]);
      manager.query.mockResolvedValue([[], 1]);

      const result = await service.runRetention();

      expect(qbMock.where).toHaveBeenCalledWith(WINDOW_SQL);
      // Nothing about the recent row appears anywhere: not archived, not
      // deleted (the service only processes what the windowed query returns).
      const archiveContent = readFileSync(
        join(archiveDir, 'audit-2026-01-01.jsonl'),
        'utf8',
      );
      expect(archiveContent).not.toContain('evt-fresh-1');
      expect(manager.query).toHaveBeenCalledTimes(2); // GUC + one delete batch
      expect(result).toEqual({ archived: 1, deleted: 1 });
      expect(recent).toBeDefined(); // fixture sanity
    });
  });

  describe('SC-RET-1b: idempotent resume via persisted watermark', () => {
    it('fetches only rows AFTER the persisted watermark (keyset predicate), then advances it', async () => {
      // Simulate a previous run that archived everything up to 2026-01-01.
      const watermarkPath = join(archiveDir, 'watermark.json');
      const previousWatermark = {
        occurredAt: '2026-01-01T00:00:00.000Z',
        id: 'evt-old-1',
      };
      writeFileSync(
        watermarkPath,
        JSON.stringify(previousWatermark),
      );

      const rowB = oldRow({
        id: 'evt-old-2',
        occurredAt: new Date('2026-01-02T00:00:00.000Z'),
      });
      qbMock.getMany.mockResolvedValueOnce([rowB]).mockResolvedValueOnce([]);
      manager.query.mockResolvedValue([[], 1]);

      const result = await service.runRetention();

      expect(result).toEqual({ archived: 1, deleted: 1 });
      // Keyset: strictly after the persisted watermark, ordered by
      // (occurredAt, id). (A second andWhere call — the empty page 2 — uses
      // the advanced watermark; the FIRST call is the persisted one.)
      expect(qbMock.andWhere).toHaveBeenCalledTimes(2);
      expect(qbMock.andWhere).toHaveBeenNthCalledWith(
        1,
        '(ae.occurredAt, ae.id) > (:wmTs, :wmId)',
        expect.objectContaining({
          wmTs: new Date('2026-01-01T00:00:00.000Z'),
          wmId: 'evt-old-1',
        }),
      );
      expect(qbMock.orderBy).toHaveBeenCalledWith('ae.occurredAt', 'ASC');
      expect(qbMock.addOrderBy).toHaveBeenCalledWith('ae.id', 'ASC');

      // Watermark advanced to the last archived row of THIS run.
      const watermark = JSON.parse(
        readFileSync(watermarkPath, 'utf8'),
      ) as { occurredAt: string; id: string };
      expect(watermark).toEqual({
        occurredAt: '2026-01-02T00:00:00.000Z',
        id: 'evt-old-2',
      });
    });

    it('rejects and skips the delete phase when the watermark file is corrupt (fail closed)', async () => {
      writeFileSync(
        join(archiveDir, 'watermark.json'),
        '{not-json',
      );

      await expect(service.runRetention()).rejects.toThrow();

      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('SC-RET-1c: file/dir permissions (0o600 files, 0o700 dir)', () => {
    it('creates the archive dir with mode 0o700 and writes archive/watermark files with mode 0o600', async () => {
      const mkdirSpy = jest.spyOn(fsPromises, 'mkdir');
      const appendFileSpy = jest.spyOn(fsPromises, 'appendFile');
      const writeFileSpy = jest.spyOn(fsPromises, 'writeFile');
      const renameSpy = jest.spyOn(fsPromises, 'rename');

      qbMock.getMany.mockResolvedValueOnce([oldRow()]).mockResolvedValueOnce([]);
      manager.query.mockResolvedValue([[], 1]);

      await service.runRetention();

      // mkdir(recursive + 0o700) for the archive dir.
      const mkdirCalls = mkdirSpy.mock.calls.filter(
        (args) => args[0] === archiveDir,
      );
      expect(mkdirCalls.length).toBeGreaterThan(0);
      for (const args of mkdirCalls) {
        expect(args[1]).toEqual({ recursive: true, mode: 0o700 });
      }
      // JSONL archive rows written with mode 0o600.
      for (const args of appendFileSpy.mock.calls) {
        expect(args[1] && typeof args[1] === 'string').toBe(true);
        expect(args[2]).toEqual({ mode: 0o600 });
      }
      // Watermark written (tmp file, 0o600) then atomically renamed.
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('watermark.json'),
        expect.stringContaining('"occurredAt"'),
        { mode: 0o600 },
      );
      expect(renameSpy).toHaveBeenCalled();
      expect(renameSpy.mock.calls[0][1]).toContain('watermark.json');
    });

    it('applies 0o600 to files created inside a pre-existing archive dir too', async () => {
      // The dir already exists from a previous run — only the JSONL file mode
      // matters here.
      mkdirSync(archiveDir, { recursive: true });
      const appendFileSpy = jest.spyOn(fsPromises, 'appendFile');

      qbMock.getMany.mockResolvedValueOnce([oldRow()]).mockResolvedValueOnce([]);
      manager.query.mockResolvedValue([[], 1]);

      await service.runRetention();

      for (const args of appendFileSpy.mock.calls) {
        expect(args[2]).toEqual({ mode: 0o600 });
      }
    });
  });

  describe('SC-RET-2: write failure aborts before any delete', () => {
    it('logs the error, rejects (job fails, no delete is executed)', async () => {
      // Target filename is an existing DIRECTORY → appendFile fails.
      mkdirSync(join(archiveDir, 'audit-2026-01-01.jsonl'));
      qbMock.getMany.mockResolvedValueOnce([oldRow()]).mockResolvedValueOnce([]);

      await expect(service.runRetention()).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive'),
      );
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('SC-RET-3: daily repeat schedule registration', () => {
    it('registers the repeatable job with pattern 0 1 * * * and attempts 3 on module init', async () => {
      await service.onModuleInit();

      expect(queueMock.add).toHaveBeenCalledWith(
        'audit-retention',
        {},
        { repeat: { pattern: '0 1 * * *' }, attempts: 3 },
      );
    });

    it('logs and swallows registration errors so bootstrap never crashes', async () => {
      queueMock.add.mockRejectedValue(new Error('redis down'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('audit-retention'),
      );
    });
  });
});

describe('AuditRetentionProcessor', () => {
  let serviceMock: { runRetention: jest.Mock };
  let processor: AuditRetentionProcessor;

  const job = { data: {} } as Job;

  beforeEach(() => {
    jest.clearAllMocks();
    serviceMock = {
      runRetention: jest.fn().mockResolvedValue({ archived: 0, deleted: 0 }),
    };
    processor = new AuditRetentionProcessor(
      serviceMock as unknown as AuditRetentionService,
    );
  });

  it('delegates to runRetention', async () => {
    await processor.process(job);

    expect(serviceMock.runRetention).toHaveBeenCalledTimes(1);
  });

  it('rethrows retention errors so the job fails (no worker crash)', async () => {
    const error = new Error('archive disk full');
    serviceMock.runRetention.mockRejectedValue(error);

    await expect(processor.process(job)).rejects.toBe(error);
  });

  describe('DI metadata (bootstrap regression: UnknownDependenciesException)', () => {
    it('emits the real class constructor in design:paramtypes — no import-type erasure', () => {
      const paramTypes = Reflect.getMetadata(
        'design:paramtypes',
        AuditRetentionProcessor,
      ) as Array<{ name?: string } | undefined>;
      const names = paramTypes.map((t) => t?.name);
      expect(names).toHaveLength(1);
      expect(names[0]).toBe('AuditRetentionService');
    });
  });
});
