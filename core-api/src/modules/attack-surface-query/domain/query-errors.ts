/** Codes of one problem found in a query (listed in `issues[]`). */
export type AsqIssueCode =
  | 'INVALID_SHAPE'
  | 'UNKNOWN_RESOURCE'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_RELATION'
  | 'OP_NOT_ALLOWED'
  | 'INVALID_VALUE'
  | 'INVALID_TIME'
  | 'MODE_CONFLICT'
  | 'LIMIT_EXCEEDED'
  | 'NOT_SORTABLE'
  | 'NOT_GROUPABLE'
  | 'HEAVY_FIELD_NOT_ALLOWED';

/** Codes of an error that stops the whole batch, or one query of it. */
export type AsqErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_CURSOR'
  | 'PERMISSION_DENIED'
  | 'COST_EXCEEDED'
  | 'NOT_IMPLEMENTED'
  | 'NOT_FOUND'
  | 'QUERY_TIMEOUT'
  | 'BUSY'
  | 'INTERNAL';

export interface AsqIssue {
  /** Where in the input, e.g. `queries.newPorts.where.items[0].value`. */
  path: string;
  code: AsqIssueCode;
  message: string;
}

/** HTTP status of each batch-level error code. */
export const ASQ_ERROR_STATUS: Record<AsqErrorCode, number> = {
  INVALID_QUERY: 400,
  INVALID_CURSOR: 400,
  NOT_IMPLEMENTED: 400,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  COST_EXCEEDED: 422,
  QUERY_TIMEOUT: 504,
  BUSY: 503,
  INTERNAL: 500,
};

/**
 * A failure the caller can act on. Its message never carries SQL or a raw
 * Postgres message: those stay in the server log.
 */
export class AsqError extends Error {
  constructor(
    readonly code: AsqErrorCode,
    message: string,
    readonly details: {
      issues?: AsqIssue[];
      cost?: number;
      budget?: number;
      estimatedRows?: number;
      hints?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'AsqError';
  }

  get status(): number {
    return ASQ_ERROR_STATUS[this.code];
  }

  toJSON(): { code: AsqErrorCode; message: string } & AsqError['details'] {
    return { code: this.code, message: this.message, ...this.details };
  }
}

export const invalidQuery = (issues: AsqIssue[]): AsqError =>
  new AsqError(
    'INVALID_QUERY',
    `${issues.length} issue(s) in the query`,
    { issues },
  );
