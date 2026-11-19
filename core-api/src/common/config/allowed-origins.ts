import { isLocalEnv } from './runtime-env';

export const LOCAL_TRUSTED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

export function parseAllowedOrigins(
  raw: string | undefined | null,
  fallback: string[] = [],
): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

/**
 * Browser origins other than the API's own that may call it with the user's
 * session: they get CORS headers (from the API and the storage buckets), and
 * better-auth accepts their requests.
 * That is `TRUSTED_ORIGINS`, the console at `BASE_URL`, and the dev servers
 * in local development. Empty means same-origin only, which is all the
 * console needs behind its nginx proxy.
 *
 * Exact origins only: a wildcard would mean different things to CORS (exact
 * match) and better-auth (pattern), so it is refused, like any value that is
 * not an http(s) URL.
 */
export function resolveTrustedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const origins = parseAllowedOrigins(env.TRUSTED_ORIGINS).map((value) =>
    toOrigin('TRUSTED_ORIGINS', value),
  );
  const baseUrl = env.BASE_URL?.trim();
  if (baseUrl) origins.push(toOrigin('BASE_URL', baseUrl));
  if (isLocalEnv(env)) origins.push(...LOCAL_TRUSTED_ORIGINS);
  return [...new Set(origins)];
}

function toOrigin(variable: string, value: string): string {
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (
    !url ||
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    value.includes('*')
  ) {
    throw new Error(
      `${variable}: "${value}" is not an http(s) origin such as https://app.example.com`,
    );
  }
  return url.origin;
}

/**
 * better-auth `trustedOrigins` for one request: the configured origins, plus
 * the request's own origin when the browser marks it `Sec-Fetch-Site:
 * same-origin`. A page cannot forge that header, and it is what lets the
 * console sign in behind a proxy that drops the port from `Host` (nginx
 * `$host`), where better-auth cannot derive the console's origin itself.
 */
export function trustedRequestOrigins(
  trusted: readonly string[],
  request: { headers: Headers } | undefined,
): string[] {
  const origin = request?.headers.get('origin');
  if (origin && request?.headers.get('sec-fetch-site') === 'same-origin') {
    return [...trusted, origin];
  }
  return [...trusted];
}
