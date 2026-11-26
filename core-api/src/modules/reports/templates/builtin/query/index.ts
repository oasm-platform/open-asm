import type { BuiltinTemplate } from '../../template.types';
import type { QueryReportData } from './data.type';
import { queryQueries, type QueryReportOptions } from './queries';
import { queryToData } from './to-data';
import { QueryDocument } from './QueryDocument';

export const queryTemplate: BuiltinTemplate<QueryReportOptions, QueryReportData> = {
  id: 'query',
  reportType: 'QUERY',
  queries: queryQueries,
  toData: queryToData,
  Document: QueryDocument,
};
