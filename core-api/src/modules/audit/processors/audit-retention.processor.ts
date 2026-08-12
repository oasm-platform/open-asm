import { BullMQName } from '@/common/enums/enum';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AuditRetentionService } from '../audit-retention.service';

/**
 * Consumes the audit-retention queue (repeatable job '0 1 * * *', registered
 * by AuditRetentionService.onModuleInit). Runs the full retention pass:
 * archive rows older than 90 days to JSONL, then delete them.
 */
@Processor(BullMQName.AUDIT_RETENTION)
export class AuditRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditRetentionProcessor.name);

  constructor(private readonly auditRetentionService: AuditRetentionService) {
    super();
  }

  async process(_job: Job<Record<string, never>>): Promise<void> {
    try {
      await this.auditRetentionService.runRetention();
    } catch (error) {
      // Log and rethrow: the job fails and BullMQ applies its retry policy —
      // a retention error must never crash the worker. Note the archive phase
      // already aborted before any delete on write failure.
      this.logger.error(
        `Audit retention failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
