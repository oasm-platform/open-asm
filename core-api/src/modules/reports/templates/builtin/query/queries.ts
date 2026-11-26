import { applyParams } from '@/modules/attack-surface-query/domain/query-params';
import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';

export interface QueryReportOptions {
  spec: Record<string, unknown>;
  title: string;
  description?: string | null;
}

export function queryQueries({ spec }: QueryReportOptions): QueryBatchInput[] {
  const options = (spec.options ?? {}) as Record<string, unknown>;
  // A saved spec may ask for another mode; a report always runs one consistent snapshot as the caller.
  return [{ ...applyParams(spec), options: { ...options, consistent: true, mode: 'interactive' } } as unknown as QueryBatchInput];
}
