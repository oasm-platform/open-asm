import type { Tool } from 'ai';
import * as dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

import { defineTool } from './helpers';
import type { ToolCallOptions } from './types';

const webFetchSchema = z.object({
  url: z.string().url().describe('Target URL'),
});

/** A fetch, redirects included, gives up after this */
const WEB_FETCH_TIMEOUT_MS = 15_000;
/** Redirects followed, each one re-checked against private addresses */
const WEB_FETCH_MAX_REDIRECTS = 5;
/** Body characters returned to the model: it is resent on every later step */
const WEB_FETCH_MAX_BODY_CHARS = 16 * 1024;
/** Bytes read from the response before the rest is dropped unread */
const WEB_FETCH_MAX_BYTES = 1024 * 1024;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIpv4(ip);
  const v6 = ip.toLowerCase();
  // IPv4-mapped (::ffff:10.0.0.1) is the IPv4 address it carries
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) || // unique local fc00::/7
    /^fe[89ab]/.test(v6) // link-local fe80::/10
  );
}

/** True when the host is, or resolves to, an address that is not public */
async function isBlockedHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((a) => a.address);
  return addresses.length === 0 || addresses.some(isPrivateIp);
}

/** Reads at most WEB_FETCH_MAX_BYTES of the body, then cancels the rest */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < WEB_FETCH_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, WEB_FETCH_MAX_BYTES).toString('utf8');
}

/** retrieve_web_page */
export function webFetchTool(): Tool {
  return defineTool({
    description: `HTTP GET to any public URL. Returns statusCode + body (first ${WEB_FETCH_MAX_BODY_CHARS / 1024}KB, truncated: true when cut). Params: url.`,
    inputSchema: webFetchSchema,
    execute: async (
      { url: rawUrl }: z.infer<typeof webFetchSchema>,
      options?: ToolCallOptions,
    ) => {
      try {
        // Stopping the run cancels the request; a slow server can't hold it
        const signal = AbortSignal.any([
          AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
          ...(options?.abortSignal ? [options.abortSignal] : []),
        ]);

        let url = new URL(rawUrl);
        for (let hop = 0; ; hop++) {
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return {
              error: 'Only http and https protocols are allowed',
              url: rawUrl,
            };
          }
          // Every hop is checked: a public URL may redirect to a private one
          if (await isBlockedHost(url.hostname)) {
            return {
              error:
                'Request blocked: target address is not publicly accessible',
              url: rawUrl,
            };
          }
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'OASM-Security-Agent/1.0' },
            redirect: 'manual',
            signal,
          });
          const location = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && location) {
            await response.body?.cancel().catch(() => undefined);
            if (hop >= WEB_FETCH_MAX_REDIRECTS) {
              return { error: 'Too many redirects', url: rawUrl };
            }
            url = new URL(location, url);
            continue;
          }

          const body = await readCapped(response);
          const truncated = body.length > WEB_FETCH_MAX_BODY_CHARS;
          return {
            statusCode: response.status,
            ...(url.href !== new URL(rawUrl).href ? { finalUrl: url.href } : {}),
            body: body.slice(0, WEB_FETCH_MAX_BODY_CHARS),
            ...(truncated ? { truncated: true } : {}),
          };
        }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          url: rawUrl,
        };
      }
    },
  });
}
