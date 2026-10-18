import UAParser from 'ua-parser-js';

export interface ParsedUserAgent {
  /** Browser, or the HTTP client for non-browser callers (API keys, workers, scripts). */
  client?: string;
  isBrowser: boolean;
  os?: string;
  deviceType: string;
  /** Vendor + model when the UA carries one, e.g. "Apple iPhone", "Samsung SM-S918B". */
  device?: string;
}

const join = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' ') || undefined;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseUserAgent(raw: string): ParsedUserAgent {
  const { browser, os, device } = new UAParser(raw).getResult();

  // ua-parser-js only knows browsers; curl/8.4.0, python-requests/2.31, Go-http-client/1.1 …
  // come back empty, so fall back to the leading product token.
  if (!browser.name) {
    return {
      client: raw.trim().split(/\s/)[0]?.replace('/', ' '),
      isBrowser: false,
      os: join(os.name, os.version),
      deviceType: 'API client',
    };
  }

  return {
    client: join(browser.name, browser.version),
    isBrowser: true,
    os: join(os.name, os.version),
    // ua-parser-js leaves device.type undefined for desktops.
    deviceType: device.type ? capitalize(device.type) : 'Desktop',
    device: join(device.vendor, device.model),
  };
}
