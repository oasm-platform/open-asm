/** One query of a query report, flattened to a table. */
export interface QueryReportTable {
  name: string;
  columns: string[];
  rows: string[][];
  /** Rows beyond the report cap, or the query's own truncation. */
  truncated: boolean;
  /** The query failed at run time (timeout, planner refusal). */
  error?: string;
}

/** Data of a report built from a saved attack surface query. */
export interface QueryReportData {
  title: string;
  description?: string | null;
  generatedAt: string;
  tables: QueryReportTable[];
  logoBase64?: string;
  systemName?: string;
  classification?: string;
}
