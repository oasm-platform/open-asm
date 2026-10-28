import { BadRequestException } from '@nestjs/common';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from './notification-cursor';

describe('notification cursor', () => {
  const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

  it('round-trips the timestamp at microsecond precision', () => {
    const cursor = { createdAt: '2026-10-28T10:00:00.123456', id: ID };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor,
    );
  });

  it('is opaque url-safe text', () => {
    expect(
      encodeNotificationCursor({ createdAt: '2026-10-28T10:00:00.123456', id: ID }),
    ).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  const encode = (raw: string) => Buffer.from(raw).toString('base64url');

  it.each([
    ['characters outside base64url', 'abc!def'],
    ['padding', `${encode(`2026-10-28T10:00:00.123456|${ID}`)}=`],
    ['a missing id', encode('2026-10-28T10:00:00.123456')],
    ['an extra part', encode(`2026-10-28T10:00:00.123456|${ID}|x`)],
    ['millisecond precision', encode(`2026-10-28T10:00:00.123|${ID}`)],
    ['a timezone suffix', encode(`2026-10-28T10:00:00.123456Z|${ID}`)],
    ['an impossible date', encode(`2026-02-30T10:00:00.123456|${ID}`)],
    ['a non-uuid id', encode('2026-10-28T10:00:00.123456|1 OR 1=1')],
  ])('rejects %s', (_, cursor) => {
    expect(() => decodeNotificationCursor(cursor)).toThrow(BadRequestException);
  });
});
