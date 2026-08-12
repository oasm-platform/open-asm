import { BullMQName } from '@/common/enums/enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { appendFile, mkdir } from 'node:fs/promises';
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
/** Daily 01:00 (server time) — plan §9. */
const REPEAT_PATTERN = '0 1 * * *';
const REPEAT_JOB_NAME = 'audit-retention';

/**
 * Retention & GDPR: archives audit rows older than 90 days to per-day JSONL
 * files, then deletes them (append-only GUC inside the same transaction).
 *
 * Order matters: the archive phase COMPLETES before the delete phase starts,
 * and any archive write error aborts the run without deleting a single row —
 * archived data must never be the only copy of a deleted row (plan §9).
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
   * Registration failures are logged, never fatal for bootstrap.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(REPEAT_JOB_NAME, {}, { repeat: { pattern: REPEAT_PATTERN } });
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
   * Throws on any archive write failure (after logging) — the BullMQ job then
   * fails and no rows are deleted.
   */
  async runRetention(): Promise<{ archived: number; deleted: number }> {
    const archiveDir = process.env.AUDIT_ARCHIVE_DIR ?? './audit-archive';

    // Phase 1 — archive. Rows are streamed in pages (oldest first); each row
    // is appended to audit-YYYY-MM-DD.jsonl in the archive dir.
    await mkdir(archiveDir, { recursive: true });

    let archived = 0;
    let page = 0;
    for (;;) {
      const rows = await this.auditEventRepo
        .createQueryBuilder('ae')
        .where(RETENTION_WINDOW_SQL)
        .orderBy('ae.occurredAt', 'ASC')
        .addOrderBy('ae.id', 'ASC')
        .take(BATCH_SIZE)
        .skip(page * BATCH_SIZE)
        .getMany();

      if (rows.length === 0) break;

      for (const row of rows) {
        const day = row.occurredAt.toISOString().slice(0, 10);
        const file = join(archiveDir, `audit-${day}.jsonl`);
        try {
          await appendFile(file, `${JSON.stringify(row)}\n`, 'utf8');
        } catch (error) {
          this.logger.error(
            `Failed to archive audit event ${row.id} to ${file}: ${
              error instanceof Error ? error.message : String(error)
            } — aborting retention, no rows deleted`,
          );
          throw error;
        }
        archived += 1;
      }

      page += 1;
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
}
