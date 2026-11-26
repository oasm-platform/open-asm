import type { BuiltinTemplate } from '../../template.types';
import type { ReportOptions } from '../../shared/asq-filters';
import type { ReportData } from './data.type';
import { summaryQueries } from './queries';
import { summaryToData } from './to-data';
import { SummaryDocument } from './SummaryDocument';

export const summaryTemplate: BuiltinTemplate<ReportOptions, ReportData> = {
  id: 'summary',
  reportType: 'SUMMARY',
  queries: summaryQueries,
  toData: summaryToData,
  Document: SummaryDocument,
};
