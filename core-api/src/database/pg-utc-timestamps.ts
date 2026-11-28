import * as pg from 'pg';

/**
 * Every `timestamp` (without time zone) column holds UTC wall-clock time: the
 * database runs in UTC and `now()` writes it. node-postgres reads that type,
 * and sends Dates, in the process's local zone, so an API running off UTC
 * (a developer machine at UTC+7) moved every date by its offset both ways.
 */

type TextParser = (value: string) => unknown;

/** The slice of node-postgres used here (`pg` is untyped in this repo) */
interface PgTypeRegistry {
  builtins: { TIMESTAMP: number; TIMESTAMPTZ: number };
  getTypeParser(oid: number, format: 'text'): TextParser;
  setTypeParser(oid: number, format: 'text', parser: TextParser): void;
}

const { types, defaults } = pg as {
  types: PgTypeRegistry;
  defaults: { parseInputDatesAsUTC: boolean };
};

/** postgres-date, which understands an explicit offset and the BC suffix */
const parseTimestamptz = types.getTypeParser(types.builtins.TIMESTAMPTZ, 'text');

/**
 * A `timestamp` value read as UTC. `infinity` / `-infinity` come back as
 * numbers, as with the driver's default parser.
 */
export function parseUtcTimestamp(value: string): Date {
  if (value === 'infinity' || value === '-infinity') {
    return parseTimestamptz(value) as Date;
  }
  const bc = value.endsWith(' BC');
  const wallClock = bc ? value.slice(0, -' BC'.length) : value;
  return parseTimestamptz(`${wallClock}+00${bc ? ' BC' : ''}`) as Date;
}

/**
 * Reads `timestamp` columns and sends Date parameters as UTC, whatever the
 * process time zone. Global to the `pg` module, so the app pool, TypeORM and
 * better-auth's pool all get it. `timestamptz` keeps its own parser.
 */
export function useUtcTimestamps(): void {
  types.setTypeParser(types.builtins.TIMESTAMP, 'text', parseUtcTimestamp);
  // A timestamp column drops a literal's offset, so a local "+07:00" literal
  // would be stored 7 hours off
  defaults.parseInputDatesAsUTC = true;
}
