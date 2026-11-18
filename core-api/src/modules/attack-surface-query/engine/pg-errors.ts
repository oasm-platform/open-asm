import { AsqError } from '../domain/query-errors';

export interface PgErrorMapping {
  error: AsqError;
  /** The SQL or catalog is wrong, not the input: alert on it. */
  bug: boolean;
}

/**
 * Maps a driver error to the error the caller sees. Messages never carry the
 * statement or Postgres' own text: those go to the server log only.
 */
export function mapPgError(err: unknown, timeoutMs: number): PgErrorMapping {
  const code = (err as { code?: unknown })?.code;
  const driverCode = typeof code === 'string' ? code : '';
  if (err instanceof AsqError) return { error: err, bug: false };
  switch (true) {
    case driverCode === '57014':
    case driverCode === '55P03':
      return { error: new AsqError('QUERY_TIMEOUT', `Query exceeded ${timeoutMs} ms`), bug: false };
    case driverCode === '53300':
    case driverCode === '57P03':
      return { error: new AsqError('BUSY', 'The database is busy, retry shortly'), bug: false };
    case driverCode === '25006':
    case driverCode.startsWith('22'):
    case driverCode.startsWith('42'):
      return { error: new AsqError('INTERNAL', 'The query could not be run'), bug: true };
    default:
      return { error: new AsqError('INTERNAL', 'The query could not be run'), bug: false };
  }
}
