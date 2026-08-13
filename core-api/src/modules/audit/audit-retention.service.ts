import { BullMQName } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import * as fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

/** Rows outside the 90-day GDPR retention window (plan §9). */
const RETENTION_WINDOW_SQL = "ae.occurredAt < now() - interval '90 days'";
/** Batch size for both the archive page and the delete LIMIT. */
const BATCH_SIZE = 5000;
/**
 * App.audit_retention must be 'on' before any DELETE: the append-only trigger
 * (block_audit_mutation, migration CreateAuditEvents) raises otherwise. The
 * GUC is set inside the retention transaction with is_local=true, so it only
 * applies to this transaction (M1 finding).
 */
const SET_RETENTION_GUC_SQL = "SELECT set_config('app.audit_retention', 'on', true)";
/**
 * Delete in fixed-size batches so a retention run never holds one giant lock
 * on audit_events. Each batch re-evaluates the 90-day window.
 */
const DELETE_BATCH_SQL = `DELETE FROM "audit_events" WHERE id IN (SELECT id FROM "audit_events" WHERE "occurredAt" < now() - interval '90 days' LIMIT ${BATCH_SIZE})`;
/**
 * State file under AUDIT_ARCHIVE_DIR holding the watermark — the (occurredAt,
 * id) of the last archived row. Makes the archive phase idempotent: the next
 * run picks up strictly AFTER the watermark via a keyset predicate, so
 * completed batches are never re-archived (code review finding).
 */
const WATERMARK_FILE = 'watermark.json';
/** Daily 01:00 (server time) — plan §9. */
const REPEAT_PATTERN = '0 1 * * *';
const REPEAT_JOB_NAME = 'audit-retention';

interface Watermark {
  occurredAt: Date;
  id: string;
}

/**
 * Retention & GDPR: archives audit rows older than 90 days to per-day JSONL
 * files, then deletes them (append-only GUC inside the same transaction).
 *
 * Order matters: the archive phase COMPLETES before the delete phase starts,
 * and any archive write error aborts the run without deleting a single row —
 * archived data must never be the only copy of a deleted row (plan §9).
 *
 * Idempotency (code review): the archive phase is resumable. A watermark file
 * (watermark.json, 0o600) records the (occurredAt, id) of the last archived
 * row after every batch; the next run pages with the keyset predicate
 * `(ae.occurredAt, ae.id) > (watermark)` instead of OFFSET, so a crashed or
 * repeated run never re-archives completed batches (at worst, the in-flight
 * batch is re-archived as duplicate JSONL lines — never lost). A corrupt
 * watermark aborts the run (fail closed, no deletes).
 *
 * Permissions (code review): the archive directory is created 0o700 and every
 * file it holds (JSONL rows + watermark) is written 0o600 — audit rows are PII.
 *
 * NOTE: the delete phase sets app.audit_retention, which the append-only
 * trigger only honors for a superuser or a member of `audit_maintenance`
 * (migration CreateAuditEvents). The DB user this service runs as must hold
 * that role (or be superuser) or the delete phase raises.
 */
@Injectable()
export class AuditRetentionService implements OnModuleInit {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    @InjectQueue(BullMQName.AUDIT_RETENTION)
    private readonly queue: Queue,
    private readonly dataSource: DataSource,
    @InjectRepository(AuditEvent)
    private readonly auditEventRepo: Repository<AuditEvent>,
  ) {}

  /**
   * Registers the daily repeat job. BullMQ v5 dedups repeatable jobs by
   * (name, pattern), so re-adding on every boot is idempotent — this mirrors
   * the integrations sync scheduler convention (integrations-sync.service.ts).
   * attempts: 3 gives a transient failure (disk, DB) two automatic retries.
   * Registration failures are logged, never fatal for bootstrap.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(REPEAT_JOB_NAME, {}, {
        repeat: { pattern: REPEAT_PATTERN },
        attempts: 3,
      });
    } catch (error) {
      this.logger.error(
        `Failed to register audit-retention repeat schedule: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Runs one retention pass. Returns the number of rows archived and deleted.
   * Throws on any archive/watermark failure (after logging) — the BullMQ job
   * then fails and no rows are deleted.
   */
  async runRetention(): Promise<{ archived: number; deleted: number }> {
    const archiveDir = process.env.AUDIT_ARCHIVE_DIR ?? './audit-archive';

    // Phase 1 — archive. Rows are streamed in pages (oldest first) via a
    // keyset cursor; each row is appended to audit-YYYY-MM-DD.jsonl.
    await fsPromises.mkdir(archiveDir, { recursive: true, mode: 0o700 });

    // Resume point of the previous run — null when the archive is new.
    let watermark = await this.loadWatermark(archiveDir);

    let archived = 0;
    for (;;) {
      const query = this.auditEventRepo
        .createQueryBuilder('ae')
        .where(RETENTION_WINDOW_SQL)
        .orderBy('ae.occurredAt', 'ASC')
        .addOrderBy('ae.id', 'ASC')
        .take(BATCH_SIZE);
      if (watermark) {
        // Keyset continuation (replaces OFFSET pagination): strictly after the
        // last archived row. The composite (occurredAt, id) tuple avoids
        // skipping rows that share the watermark timestamp.
        query.andWhere('(ae.occurredAt, ae.id) > (:wmTs, :wmId)', {
          wmTs: watermark.occurredAt,
          wmId: watermark.id,
        });
      }
      const rows = await query.getMany();

      if (rows.length === 0) break;

      for (const row of rows) {
        const day = row.occurredAt.toISOString().slice(0, 10);
        const file = join(archiveDir, `audit-${day}.jsonl`);
        try {
          await fsPromises.appendFile(file, `${JSON.stringify(row)}\n`, {
            mode: 0o600,
          });
        } catch (error) {
          this.logger.error(
            `Failed to archive audit event ${row.id} to ${file}: ${
              error instanceof Error ? error.message : String(error)
            } — aborting retention, no rows deleted`,
          );
          throw error;
        }
      }

      // Advance the watermark to the last row of this batch (rows are ordered
      // ASC, so that is the max occurredAt) and persist it BEFORE the next
      // page — a crash after this point resumes cleanly after this batch.
      const last = rows[rows.length - 1];
      watermark = { occurredAt: last.occurredAt, id: last.id };
      await this.persistWatermark(archiveDir, watermark);
      archived += rows.length;
    }

    // Phase 2 — delete, in batches, inside one explicit transaction with the
    // append-only GUC set BEFORE the first DELETE.
    let deleted = 0;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(SET_RETENTION_GUC_SQL);
      for (;;) {
        // Postgres query() returns [rows, rowCount] for DML (M1 finding).
        const [, rowCount] = await manager.query<[unknown[], number]>(
          DELETE_BATCH_SQL,
        );
        const affected = rowCount ?? 0;
        deleted += affected;
        if (affected < BATCH_SIZE) break;
      }
    });

    this.logger.log(
      `Audit retention complete: archived ${archived} row(s), deleted ${deleted} row(s)`,
    );
    return { archived, deleted };
  }

  /**
   * Reads the persisted watermark. Missing file (fresh archive) → null.
   * Anything else (read error, corrupt JSON, wrong shape) → throw: the run
   * aborts BEFORE any delete rather than risk archiving from the wrong point.
   */
  private async loadWatermark(archiveDir: string): Promise<Watermark | null> {
    const path = join(archiveDir, WATERMARK_FILE);
    let raw: string;
    try {
      raw = await fsPromises.readFile(path, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    let parsed: { occurredAt?: string; id?: string };
    try {
      parsed = JSON.parse(raw) as { occurredAt?: string; id?: string };
    } catch (error) {
      throw new Error(
        `Corrupt retention watermark ${path}: ${String(error)} — fix or delete the file to recover`,
      );
    }
    if (typeof parsed.occurredAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error(
        `Corrupt retention watermark ${path}: expected { occurredAt, id }`,
      );
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error(
        `Corrupt retention watermark ${path}: invalid occurredAt ${parsed.occurredAt}`,
      );
    }
    return { occurredAt, id: parsed.id };
  }

  /**
   * Writes the watermark atomically (tmp + rename) with 0o600 — a crash can
   * never leave a half-written state file that would poison the next run.
   */
  private async persistWatermark(
    archiveDir: string,
    watermark: Watermark,
  ): Promise<void> {
    const path = join(archiveDir, WATERMARK_FILE);
    const tmp = `${path}.tmp`;
    await fsPromises.writeFile(
      tmp,
      JSON.stringify({
        occurredAt: watermark.occurredAt.toISOString(),
        id: watermark.id,
      }),
      { mode: 0o600 },
    );
    await fsPromises.rename(tmp, path);
  }
}
