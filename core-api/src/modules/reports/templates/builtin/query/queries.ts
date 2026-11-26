import { applyParams } from '@/modules/attack-surface-query/domain/query-params';
import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';
import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import type { TemplateContext } from '../../template.types';
import type { QueryReportData } from './data.type';
import { toReportTables } from './to-data';

export interface QueryReportOptions {
  spec: Record<string, unknown>;
  title: string;
  description?: string | null;
}

export function queryQueries({ spec }: QueryReportOptions, _now: Date): QueryBatchInput[] {
  const options = (spec.options ?? {}) as Record<string, unknown>;
  // A saved spec may ask for another mode; a report always runs one consistent snapshot as the caller.
  return [{ ...applyParams(spec), options: { ...options, consistent: true, mode: 'interactive' } } as unknown as QueryBatchInput];
}

export function queryToData(results: QueryBatchResult[], ctx: TemplateContext<QueryReportOptions>): QueryReportData {
  return {
    title: ctx.options.title,
    description: ctx.options.description,
    generatedAt: ctx.now.toISOString(),
    tables: toReportTables(results[0]),
  };
}
