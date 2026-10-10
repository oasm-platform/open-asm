/**
 * Secret redaction for anything that leaves the process.
 *
 * WHY THIS IS ITS OWN MODULE, and why it runs at the PRODUCER:
 * a published event is TRANSPORT. It lands in Redis, and from there it is read
 * by the audit sink, forwarded to customer webhooks, Slack and ticketing
 * systems, and potentially emailed. Redacting only on the way into one of those
 * sinks leaves the secret sitting in Redis and in every other sink's hands — so
 * redaction happens once, where the data enters the bus, and again at the audit
 * table as defence in depth (a stream entry can also arrive from something other
 * than this code).
 *
 * Two independent rules, because they catch different mistakes:
 *  - KEY NAME: anything that looks like a credential field is dropped outright,
 *    since its value is unusable by definition.
 *  - VALUE: a value that looks like a credential is replaced with `***`, even
 *    under an innocuous key — that is what catches a token pasted into a `value`
 *    field, which the key-name rule alone would wave through.
 */
const SECRET_KEY_RE =
  /(secret|token|password|credential|api.?key|private.?key|access.?key|authorization|bearer|passphrase|cert|ssh.?key)/i;

/** Prefixes that mark a VALUE as a credential (OpenAI, AWS, PEM). */
const SECRET_VALUE_PREFIX_RE = /^(sk-|AKIA|-----BEGIN)/i;

/** Long, delimiter-free strings are almost certainly keys or tokens. */
const SECRET_VALUE_LONG_RE = /^[A-Za-z0-9+/=_-]+$/;

/**
 * Length above which a bare token is treated as secret. 40 sits above UUID
 * length (36) so resource ids are not over-redacted, while still catching the
 * bulk of real API tokens (GitHub `ghp_`, Slack `xoxb-`, PATs).
 */
const SECRET_VALUE_MIN_LENGTH = 40;

export const REDACTED = '***';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeSecretValue = (value: string): boolean =>
  SECRET_VALUE_PREFIX_RE.test(value) ||
  (value.length >= SECRET_VALUE_MIN_LENGTH && SECRET_VALUE_LONG_RE.test(value));

/**
 * Deep copy with credential fields removed and credential-looking values masked.
 * Applied recursively, including inside arrays of objects.
 *
 * Returns a NEW object: the caller's value is never mutated, so an event can be
 * redacted for transport while the original stays intact in the producer.
 */
export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') {
    return (looksLikeSecretValue(value) ? REDACTED : value) as T;
  }

  // Element type is preserved, so a `string[]` stays a `string[]` with the
  // secret entries masked rather than widening to `unknown[]`.
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactSecrets(item)) as T;
  }

  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) continue;
      copy[key] = redactSecrets(item);
    }
    return copy as T;
  }

  // Numbers, booleans, null, undefined, Dates — nothing to scrub.
  return value;
}