/**
 * Shared HTTP plumbing for the source-code providers (GitHub, GitLab).
 *
 * Both are plain REST APIs with token auth; the differences (auth header,
 * pagination headers, payload shapes) stay in each connector. This file only
 * owns the request deadline and turning HTTP failures into messages a user
 * can act on from the "Test integration" toast.
 */

/** A hung provider must not stall the event-bridge lane or a test request. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface ProviderResponse<T> {
  body: T;
  headers: Headers;
}

/** Strips a trailing slash so `${base}${path}` never produces `//`. */
export function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function providerFetch<T>(
  provider: string,
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<ProviderResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${provider} API unreachable: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(await describeFailure(provider, response));
  }

  const body = (response.status === 204 ? undefined : await response.json()) as T;
  return { body, headers: response.headers };
}

async function describeFailure(
  provider: string,
  response: Response,
): Promise<string> {
  // Provider error bodies are `{ message }` (GitHub / GitLab). Never echo the
  // raw body beyond that field — it can be a full HTML error page.
  let detail = '';
  try {
    const parsed = (await response.json()) as {
      message?: unknown;
      error?: unknown;
    };
    const message = parsed.message ?? parsed.error;
    detail = typeof message === 'string' ? message : JSON.stringify(message);
  } catch {
    // non-JSON body — the status alone is enough
  }

  const hint: Record<number, string> = {
    401: 'token is invalid or expired',
    403: 'token lacks the required permission (or rate limit exceeded)',
    404: 'resource not found or not visible to this token',
  };
  const reason = hint[response.status] ?? `HTTP ${response.status}`;
  return `${provider} API error: ${reason}${detail ? ` (${detail})` : ''}`;
}
