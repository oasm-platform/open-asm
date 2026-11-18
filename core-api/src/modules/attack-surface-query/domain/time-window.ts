const UNIT_MS = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

const RELATIVE = /^now(?:([+-])(\d{1,4})([mhdw]))?$/;
// ISO 8601 date-time with an explicit offset: a bare local time would be read
// in the server's time zone, so it is refused.
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const MAX_RELATIVE_AMOUNT = 3650;
/** How far past `now` a window may end. */
export const MAX_WINDOW_FUTURE_MS = UNIT_MS.d;

export type TimeParse =
  | { ok: true; value: Date }
  | { ok: false; message: string };

/**
 * Reads one time expression: `now`, `now-<n><unit>`, `now+<n><unit>` (only
 * when `allowFuture`) with unit m|h|d|w, or an ISO 8601 date-time with an
 * offset. `now` is the batch's single clock reading.
 */
export function parseTimeExpr(
  expr: string,
  now: Date,
  options: { allowFuture?: boolean } = {},
): TimeParse {
  const relative = RELATIVE.exec(expr);
  if (relative) {
    const [, sign, amount, unit] = relative;
    if (!sign) return { ok: true, value: new Date(now.getTime()) };
    const n = Number(amount);
    if (n < 1 || n > MAX_RELATIVE_AMOUNT) {
      return {
        ok: false,
        message: `"${expr}": the amount must be 1-${MAX_RELATIVE_AMOUNT}`,
      };
    }
    if (sign === '+' && !options.allowFuture) {
      return { ok: false, message: `"${expr}": future times are only allowed as filter values` };
    }
    const offset = n * UNIT_MS[unit as keyof typeof UNIT_MS];
    return {
      ok: true,
      value: new Date(now.getTime() + (sign === '+' ? offset : -offset)),
    };
  }
  if (ISO_WITH_OFFSET.test(expr)) {
    const value = new Date(expr);
    if (!Number.isNaN(value.getTime())) return { ok: true, value };
  }
  return {
    ok: false,
    message: `"${expr}" is not a time: use now, now-<n><m|h|d|w> or an ISO 8601 date-time with an offset`,
  };
}

export interface TimeWindowInput {
  since: string;
  until?: string;
}

export interface ResolvedWindow {
  since: Date;
  until: Date;
}

export type WindowParse =
  | { ok: true; value: ResolvedWindow }
  | { ok: false; message: string };

/** Resolves a window to `[since, until)`; `until` defaults to `now`. */
export function resolveWindow(
  input: TimeWindowInput,
  now: Date,
): WindowParse {
  const since = parseTimeExpr(input.since, now);
  if (!since.ok) return since;
  const until = input.until === undefined ? { ok: true as const, value: now } : parseTimeExpr(input.until, now);
  if (!until.ok) return until;
  if (since.value.getTime() >= until.value.getTime()) {
    return { ok: false, message: 'since must be before until' };
  }
  if (until.value.getTime() > now.getTime() + MAX_WINDOW_FUTURE_MS) {
    return { ok: false, message: 'until must not be more than one day after now' };
  }
  return { ok: true, value: { since: since.value, until: until.value } };
}
