/**
 * Normalize a protobuf Timestamp ({seconds, nanos}), Date, ISO string, or epoch
 * number to a Date object.
 *
 * @param val - value to normalize
 * @returns Date if valid, undefined otherwise
 */
export function normalizeTimestamp(val: unknown): Date | undefined {
  if (val === null || val === undefined) {
    return undefined;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? undefined : val;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof val === 'object' && 'seconds' in val) {
    const sec = Number((val as { seconds: string | number }).seconds);
    return isNaN(sec) ? undefined : new Date(sec * 1000);
  }
  return undefined;
}
