import { parseTimeExpr, resolveWindow } from './time-window';

const NOW = new Date('2026-11-18T07:00:00.000Z');
const DAY = 86_400_000;

describe('parseTimeExpr', () => {
  it.each([
    ['now', 0],
    ['now-5d', -5 * DAY],
    ['now-24h', -DAY],
    ['now-30m', -30 * 60_000],
    ['now-2w', -14 * DAY],
  ])('reads %s relative to the batch clock', (expr, offset) => {
    const parsed = parseTimeExpr(expr, NOW);
    expect(parsed).toEqual({ ok: true, value: new Date(NOW.getTime() + offset) });
  });

  it('reads ISO date-times with an offset', () => {
    expect(parseTimeExpr('2026-11-01T00:00:00Z', NOW)).toEqual({ ok: true, value: new Date('2026-11-01T00:00:00Z') });
    expect(parseTimeExpr('2026-11-01T07:00:00+07:00', NOW)).toEqual({ ok: true, value: new Date('2026-11-01T00:00:00Z') });
  });

  it('refuses an ISO time without an offset', () => {
    expect(parseTimeExpr('2026-11-01T00:00:00', NOW).ok).toBe(false);
  });

  it('refuses amounts outside 1-3650', () => {
    expect(parseTimeExpr('now-0d', NOW).ok).toBe(false);
    expect(parseTimeExpr('now-3651d', NOW).ok).toBe(false);
  });

  it('allows future times only when asked (filter values)', () => {
    expect(parseTimeExpr('now+30d', NOW).ok).toBe(false);
    expect(parseTimeExpr('now+30d', NOW, { allowFuture: true })).toEqual({
      ok: true,
      value: new Date(NOW.getTime() + 30 * DAY),
    });
  });

  it('refuses garbage', () => {
    expect(parseTimeExpr('yesterday', NOW).ok).toBe(false);
    expect(parseTimeExpr("now-5d'; DROP", NOW).ok).toBe(false);
  });
});

describe('resolveWindow', () => {
  it('defaults until to now', () => {
    expect(resolveWindow({ since: 'now-5d' }, NOW)).toEqual({
      ok: true,
      value: { since: new Date(NOW.getTime() - 5 * DAY), until: NOW },
    });
  });

  it('refuses since >= until', () => {
    expect(resolveWindow({ since: 'now', until: 'now-1d' }, NOW).ok).toBe(false);
  });

  it('refuses a future window, even when written as an ISO date', () => {
    expect(resolveWindow({ since: 'now-1d', until: 'now+2d' }, NOW).ok).toBe(false);
    expect(resolveWindow({ since: 'now-1d', until: '2026-11-25T00:00:00Z' }, NOW).ok).toBe(false);
  });
});
