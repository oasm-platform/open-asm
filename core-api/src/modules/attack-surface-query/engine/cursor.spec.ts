import { AsqError } from '../domain/query-errors';
import { CursorCodec, keysetPredicate, type KeysetColumn } from './cursor';

describe('CursorCodec', () => {
  const codec = new CursorCodec('secret');
  const keys = ['2026-11-17T00:00:00.000Z', 'id-1'];

  it('round-trips the keys of the same query and workspace', () => {
    const cursor = codec.encode('sig', 'w1', keys);
    expect(codec.decode(cursor, 'sig', 'w1', 2)).toEqual(keys);
  });

  it.each([
    ['another query', 'sig2', 'w1', 2],
    ['another workspace', 'sig', 'w2', 2],
    ['another key count', 'sig', 'w1', 3],
  ])('refuses a cursor of %s', (_label, sig, ws, n) => {
    const cursor = codec.encode('sig', 'w1', keys);
    expect(() => codec.decode(cursor, sig, ws, n)).toThrow(AsqError);
  });

  it('refuses a tampered or foreign cursor', () => {
    const cursor = codec.encode('sig', 'w1', keys);
    const [body, mac] = cursor.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, q: 'sig', w: 'x', k: keys })).toString('base64url');
    expect(() => codec.decode(`${forged}.${mac}`, 'sig', 'w1', 2)).toThrow(AsqError);
    expect(() => codec.decode(`${body}.AAAA`, 'sig', 'w1', 2)).toThrow(AsqError);
    expect(() => new CursorCodec('other').decode(cursor, 'sig', 'w1', 2)).toThrow(AsqError);
    expect(() => codec.decode('garbage', 'sig', 'w1', 2)).toThrow(AsqError);
  });

  it('needs a secret', () => {
    expect(() => new CursorCodec('')).toThrow();
  });
});

describe('keysetPredicate', () => {
  const bind = () => {
    let n = 0;
    return () => `:p${n++}`;
  };
  const col = (sql: string, dir: 'asc' | 'desc', nullable = false): KeysetColumn => ({ sql, dir, cast: 'text', nullable });

  it('continues after the last row for mixed directions', () => {
    expect(keysetPredicate([col('a', 'desc'), col('id', 'asc')], ['x', 'y'], bind())).toBe(
      '(a < CAST(:p0 AS text) OR (a = CAST(:p0 AS text) AND id > CAST(:p1 AS text)))',
    );
  });

  it('places NULLs last', () => {
    expect(keysetPredicate([col('a', 'asc', true), col('id', 'asc')], ['x', 'y'], bind())).toBe(
      '((a > CAST(:p0 AS text) OR a IS NULL) OR (a = CAST(:p0 AS text) AND id > CAST(:p1 AS text)))',
    );
    expect(keysetPredicate([col('a', 'asc', true), col('id', 'asc')], [null, 'y'], bind())).toBe(
      '(a IS NULL AND id > CAST(:p0 AS text))',
    );
  });
});
