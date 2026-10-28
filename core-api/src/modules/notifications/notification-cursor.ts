import { BadRequestException } from '@nestjs/common';

/**
 * Keyset cursor of the notification list = base64url(`createdAt` + '|' + `id`),
 * the sort key of the query (createdAt DESC, id DESC); id breaks ties between
 * rows that share a timestamp.
 *
 * `createdAt` is a microsecond `timestamp`, so the cursor carries the value as
 * Postgres renders it ({@link CURSOR_TS_SQL}), never a JS Date: a Date keeps
 * milliseconds only, and the next page would skip every row created later in
 * the same millisecond as the last one shown.
 */
const SEPARATOR = '|';

/** Renders `createdAt` at full precision, independent of the session DateStyle. */
export const CURSOR_TS_SQL = `to_char(recipient."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/** Strict unpadded base64url; Node's decoder silently skips invalid chars. */
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationCursor {
  /** `YYYY-MM-DDTHH:mm:ss.ffffff`, as produced by {@link CURSOR_TS_SQL}. */
  createdAt: string;
  id: string;
}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    `${cursor.createdAt}${SEPARATOR}${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/** Inverse of {@link encodeNotificationCursor}; 400 on anything malformed. */
export function decodeNotificationCursor(cursor: string): NotificationCursor {
  if (!BASE64URL_RE.test(cursor)) {
    throw new BadRequestException('Invalid cursor');
  }
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split(SEPARATOR);
  if (parts.length !== 2) {
    throw new BadRequestException('Invalid cursor');
  }
  const [createdAt, id] = parts;
  if (!TS_RE.test(createdAt) || !UUID_RE.test(id)) {
    throw new BadRequestException('Invalid cursor');
  }
  // Shape alone lets '2026-13-45T…' through, which Postgres would reject with
  // a 500; a date that does not survive a round trip is not a real one.
  const date = new Date(`${createdAt.slice(0, 19)}Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 19) !== createdAt.slice(0, 19)
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { createdAt, id };
}
