import type { ToolCategory } from '../../../../common/enums/enum';
import type { Job } from '../../../jobs-registry/entities/job.entity';
import type { InsertResult } from 'typeorm';

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * Generic input payload for all data adapter handlers.
 */
export interface HandlerPayload<T = unknown> {
  data: T;
  job: Job;
}

/**
 * Contract for every data-adapter handler.
 *
 * Each handler is responsible for exactly one ToolCategory.
 */
export interface IDataHandler<T = unknown> {
  /** The tool category this handler supports. */
  readonly category: ToolCategory;

  /**
   * Validate incoming data before processing.
   * Called BEFORE handle() — the orchestrator will skip handle()
   * if this returns { valid: false }.
   */
  validate(data: T, job: Job): Promise<ValidationResult>;

  /**
   * Persist / process the validated data.
   * All side effects (DB writes, file uploads, event emission) happen here.
   * Transaction boundaries are the handler's responsibility.
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  handle(payload: HandlerPayload<T>): Promise<void | InsertResult>;
}
