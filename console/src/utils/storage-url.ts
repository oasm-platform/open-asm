/**
 * Helpers for rendering storage-backed URLs in the console.
 *
 * The API now emits absolute client URLs for every storage path (plain
 * public URLs when the boot policy flag is set, presigned otherwise), so
 * consumers must render the field verbatim. Only legacy relative values
 * (starting with `/`) still need the app origin prepended.
 */

/**
 * Cap for signed-screenshot query cache, in ms.
 *
 * Server buckets `signingDate` to the hour and exposes TTLs up to ~2 days,
 * so the old 60s cap is overly conservative. A 45-minute cap stays safe:
 * a URL signed at the start of an hour bucket remains valid for at least
 * `TTL − 59min`, and 45min < 1h keeps the cache window strictly inside the
 * hour-bucket boundary so URLs never expire mid-cache-window. Must stay ≤1h.
 */
export const SCREENSHOT_STALE_TIME_CAP_MS = 45 * 60 * 1000;

/**
 * Resolve a storage `logoPath`/`screenshotPath`/`iconUrl` value to an `<img>`
 * `src`. Absolute `http(s)`/`data:`/`blob:` values pass through untouched;
 * relative `/...` values get `window.location.origin` prepended.
 *
 * @param path Raw field value from the API (may be null or a non-string).
 * @returns Usable `src`, or null when there is no logo.
 */
export function resolveClientUrl(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) return null;
  if (/^(https?:\/\/|data:|blob:)/.test(path)) return path;
  if (path.startsWith('/')) return `${window.location.origin}${path}`;
  return path;
}

/**
 * Derive the TanStack Query `staleTime` for signed `screenshotPath` queries
 * from the server-exposed presign TTL, keeping a 20% safety margin so cached
 * URLs never outlive their signature: `min(45min, ttl * 0.8)`. The 45min cap
 * stays under the 1h signing-date bucket boundary, so even a URL signed at
 * hour start (valid ≥ TTL−59min) never expires mid-cache-window.
 *
 * Public `logoPath`/`iconUrl` fields need no bound — leave their queries
 * uncached-by-TTL (do not call this for them).
 *
 * @param ttlSeconds `storagePresignTtlSeconds` from `useRootControllerGetMetadata`.
 * @returns `staleTime` in ms.
 */
export function deriveScreenshotStaleTime(
  ttlSeconds?: number | null,
): number {
  if (
    typeof ttlSeconds !== 'number' ||
    !Number.isFinite(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    return SCREENSHOT_STALE_TIME_CAP_MS;
  }
  return Math.min(
    SCREENSHOT_STALE_TIME_CAP_MS,
    Math.floor(ttlSeconds * 1000 * 0.8),
  );
}
