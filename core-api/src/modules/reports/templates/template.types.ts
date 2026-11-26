import type React from 'react';
import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';
import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';

export type TemplateId = 'summary' | 'vulnerability' | 'query';

export interface TemplateContext<O> {
  workspaceName: string;
  now: Date;
  options: O;
}

/** Fields `renderTemplatePdf` adds to every document's data. */
export interface RenderExtras {
  logoBase64?: string;
  systemName: string;
  classification: string;
}

/** What a mapper returns: the data without the fields `renderTemplatePdf` adds. */
export type MappedData<D> = Omit<D, 'systemName' | 'classification'>;

export interface BuiltinTemplate<O, D> {
  id: TemplateId;
  reportType: 'SUMMARY' | 'VULNERABILITY' | 'QUERY';
  queries(options: O, now: Date): QueryBatchInput[];
  toData(results: QueryBatchResult[], ctx: TemplateContext<O>): D;
  Document: React.FC<{ data: D & RenderExtras }>;
}
