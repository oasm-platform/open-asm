import { defaults, types, utils } from 'pg';
import { parseUtcTimestamp, useUtcTimestamps } from './pg-utc-timestamps';

// Every `timestamp` column holds UTC wall-clock time (the database runs in
// UTC and `now()` writes it). node-postgres reads and writes that type in the
// process's local zone, so on a host off UTC every date moved by its offset.
describe('UTC timestamps over node-postgres', () => {
  const originalParser = types.getTypeParser(types.builtins.TIMESTAMP, 'text');
  const originalInputAsUtc = defaults.parseInputDatesAsUTC;

  afterEach(() => {
    types.setTypeParser(types.builtins.TIMESTAMP, originalParser);
    defaults.parseInputDatesAsUTC = originalInputAsUtc;
  });

  describe('parseUtcTimestamp', () => {
    it('reads a timestamp as UTC whatever the process time zone', () => {
      expect(parseUtcTimestamp('2026-11-28 09:14:48.154202').toISOString()).toBe(
        '2026-11-28T09:14:48.154Z',
      );
    });

    it('reads a timestamp without fractional seconds', () => {
      expect(parseUtcTimestamp('2026-01-02 03:04:05').toISOString()).toBe(
        '2026-01-02T03:04:05.000Z',
      );
    });

    it('keeps the BC era', () => {
      expect(parseUtcTimestamp('0044-03-15 12:00:00 BC').getUTCFullYear()).toBe(-43);
    });

    it('passes infinity through as the default parser does', () => {
      expect(parseUtcTimestamp('infinity')).toBe(Infinity);
      expect(parseUtcTimestamp('-infinity')).toBe(-Infinity);
    });
  });

  describe('useUtcTimestamps', () => {
    it('makes the driver read timestamp columns as UTC', () => {
      useUtcTimestamps();

      const parse = types.getTypeParser(types.builtins.TIMESTAMP, 'text');
      expect(parse('2026-11-28 09:14:48.154').toISOString()).toBe(
        '2026-11-28T09:14:48.154Z',
      );
    });

    it('makes the driver send dates as UTC, which a timestamp column keeps as is', () => {
      useUtcTimestamps();

      // Postgres drops the offset of a literal it stores in a timestamp
      // column, so a local "+07:00" literal would be kept 7 hours off
      expect(utils.prepareValue(new Date(Date.UTC(2026, 10, 28, 9, 14, 48)))).toBe(
        '2026-11-28T09:14:48.000+00:00',
      );
    });

    it('leaves timestamptz columns to their own parser', () => {
      const before = types.getTypeParser(types.builtins.TIMESTAMPTZ, 'text');
      useUtcTimestamps();
      expect(types.getTypeParser(types.builtins.TIMESTAMPTZ, 'text')).toBe(before);
    });
  });
});
