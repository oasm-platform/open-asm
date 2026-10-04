/**
 * Helpers for talking to presigned object-storage URLs (S3 / RustFS).
 *
 * These use plain `fetch` instead of `axiosInstance` on purpose: a presigned
 * URL is absolute (it already points at the storage host, so the axios baseURL
 * must not be prefixed) and its signature is computed over the exact request.
 * Routing through axios would attach `X-Workspace-Id`, cookies and params
 * serialisation and perturb the signature into a 403.
 */

/**
 * Throw an Error carrying the status and the response body when `res` is not
 * 2xx. Bodies are read here so callers never see a half-consumed response.
 */
async function throwIfNotOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '<unreadable body>');
  throw new Error(`${action} failed: ${res.status} ${res.statusText} - ${body}`);
}

/**
 * Upload an object with a presigned PUT URL.
 *
 * The server signs `Content-Type` (via `signableHeaders`), so the header MUST
 * be echoed back byte-for-byte — a browser default (or any drift) is rejected
 * by S3 with 403 SignatureDoesNotMatch. This is the single place that
 * guarantees the header matches the value that was signed.
 *
 * @param url Absolute presigned PUT URL from the presign endpoint.
 * @param body File contents to store.
 * @param contentType The exact MIME type that was requested at presign time.
 * @returns The successful response (2xx).
 */
export async function uploadToPresignedUrl(
  url: string,
  body: Blob | string,
  contentType: string,
): Promise<Response> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  await throwIfNotOk(res, 'Upload');
  return res;
}

/**
 * Download an object with a presigned GET URL as UTF-8 text.
 *
 * @param url Absolute presigned GET URL.
 * @returns The object body as text.
 */
export async function fetchPresignedText(url: string): Promise<string> {
  const res = await fetch(url);
  await throwIfNotOk(res, 'Download');
  return res.text();
}

/**
 * Download an object with a presigned GET URL as a Blob (binary-safe, e.g. for
 * a PDF preview in the editor).
 *
 * @param url Absolute presigned GET URL.
 * @returns The object body as a Blob.
 */
export async function fetchPresignedBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  await throwIfNotOk(res, 'Download');
  return res.blob();
}