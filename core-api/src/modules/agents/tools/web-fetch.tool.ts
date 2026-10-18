import type { Tool } from 'ai';
import * as dns from 'node:dns/promises';
import { z } from 'zod';

import { defineTool } from './helpers';

const webFetchSchema = z.object({
  url: z.string().url().describe('Target URL'),
});

function isPrivateIp(ip: string): boolean {
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

/** retrieve_web_page */
export function webFetchTool(): Tool {
  return defineTool({
    description:
      'HTTP GET to any public URL. Returns statusCode + body. Params: url.',
    inputSchema: webFetchSchema,
    execute: async ({ url: rawUrl }: z.infer<typeof webFetchSchema>) => {
      try {
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return {
            error: 'Only http and https protocols are allowed',
            url: rawUrl,
          };
        }
        const addresses = await dns.resolve4(parsedUrl.hostname);
        if (addresses.some(isPrivateIp)) {
          return {
            error: 'Request blocked: target address is not publicly accessible',
            url: rawUrl,
          };
        }
        const response = await fetch(rawUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'OASM-Security-Agent/1.0' },
        });
        return { statusCode: response.status, body: await response.text() };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
          url: rawUrl,
        };
      }
    },
  });
}
