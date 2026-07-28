import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager, InsertResult } from 'typeorm';
import type { ToolCategory } from '../../../common/enums/enum';
import type { Job } from '../../jobs-registry/entities/job.entity';
import {
  type IDataHandler,
  type HandlerPayload,
  type ValidationResult,
} from './interfaces/data-handler.interface';

/**
 * Abstract base for all data-adapter handlers.
 *
 * Provides:
 * - Standard `validate()` that accepts all data by default
 * - `runInTransaction()` helper wrapping dataSource.transaction()
 * - `deduplicateBy()` utility for de-duplicating arrays by key
 */
export abstract class BaseHandler<T> implements IDataHandler<T> {
  protected readonly logger = new Logger(this.constructor.name);

  abstract readonly category: ToolCategory;

  constructor(protected readonly dataSource: DataSource) {}

  /** Override in subclass if data shape needs validation. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(_data: T, _job: Job): Promise<ValidationResult> {
    return { valid: true };
  }

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  abstract handle(payload: HandlerPayload<T>): Promise<void | InsertResult>;

  /**
   * Run a callback inside a TypeORM transaction.
   * Automatically commits on success, rolls back on error.
   */
  protected async runInTransaction<TResult>(
    fn: (manager: EntityManager) => Promise<TResult>,
  ): Promise<TResult> {
    return this.dataSource.transaction(fn);
  }

  /**
   * Deduplicate an array of items by a key-extraction function.
   * Keeps the last occurrence of each key.
   */
  protected deduplicateBy<TItem>(
    items: TItem[],
    keyFn: (item: TItem) => string,
  ): TItem[] {
    return Array.from(
      new Map(items.map((item) => [keyFn(item), item])).values(),
    );
  }
}
