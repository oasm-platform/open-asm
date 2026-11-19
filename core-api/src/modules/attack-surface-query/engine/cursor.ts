import { createHmac, timingSafeEqual } from 'node:crypto';

import { AsqError } from '../domain/query-errors';
import { sha256 } from '../domain/query-signature';
import type { SortDir } from '../domain/query.types';

export type CursorValue = string | number | boolean | null;

interface CursorPayload {
  v: 1;
  q: string;
  w: string;
  k: CursorValue[];
}

/**
 * Signs and verifies keyset cursors. The key is derived from a server secret
 * with a fixed label, so a cursor cannot be forged or replayed in another
 * workspace or on another query.
 */
export class CursorCodec {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret) throw new Error('AttackSurfaceQuery: a server secret is required to sign cursors');
    this.key = createHmac('sha256', secret).update('asq-cursor-v1').digest();
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }

  private workspaceTag(workspaceId: string): string {
    return sha256(`ws:${workspaceId}`).slice(0, 16);
  }

  encode(signature: string, workspaceId: string, keys: CursorValue[]): string {
    const payload: CursorPayload = { v: 1, q: signature, w: this.workspaceTag(workspaceId), k: keys };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  /** The sort keys of the row a page ends on; throws INVALID_CURSOR. */
  decode(cursor: string, signature: string, workspaceId: string, keyCount: number): CursorValue[] {
    const invalid = () => new AsqError('INVALID_CURSOR', 'The cursor is invalid or belongs to another query');
    const [body, mac] = cursor.split('.');
    if (!body || !mac) throw invalid();
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
    let payload: CursorPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CursorPayload;
    } catch {
      throw invalid();
    }
    if (
      payload.v !== 1 ||
      payload.q !== signature ||
      payload.w !== this.workspaceTag(workspaceId) ||
      !Array.isArray(payload.k) ||
      payload.k.length !== keyCount
    ) {
      throw invalid();
    }
    return payload.k;
  }
}

export interface KeysetColumn {
  /** SQL of the sort expression. */
  sql: string;
  dir: SortDir;
  /** Cast for the bound value, e.g. `timestamptz`. */
  cast: string;
  nullable: boolean;
}

/**
 * Predicate selecting the rows after `values` in the order
 * `ORDER BY c1 d1 NULLS LAST, …, cn dn NULLS LAST` (the last column is the
 * unique id). `bind` binds a value and returns its placeholder.
 */
export function keysetPredicate(
  columns: KeysetColumn[],
  values: CursorValue[],
  bind: (value: unknown) => string,
): string {
  const build = (i: number): string => {
    const col = columns[i];
    const value = values[i];
    const after = col.dir === 'asc' ? '>' : '<';
    // Bound once per column, in column order.
    const p = value === null ? '' : `CAST(${bind(value)} AS ${col.cast})`;
    const rest = i + 1 < columns.length ? build(i + 1) : null;
    if (value === null) {
      // NULLS LAST: after a NULL only more NULLs (with larger tie-breakers) follow.
      return rest ? `(${col.sql} IS NULL AND ${rest})` : 'false';
    }
    const beyond = col.nullable ? `(${col.sql} ${after} ${p} OR ${col.sql} IS NULL)` : `${col.sql} ${after} ${p}`;
    return rest ? `(${beyond} OR (${col.sql} = ${p} AND ${rest}))` : beyond;
  };
  return build(0);
}
