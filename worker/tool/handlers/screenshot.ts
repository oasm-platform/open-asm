import puppeteer, { Browser } from "puppeteer";
import { existsSync } from "fs";
import type { Job } from "../../services/core-api/api";

// Shared browser instance to reuse across requests
let browser: Browser | null = null;

// Array of realistic user agents to rotate and avoid detection
const USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",

  // Chrome on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",

  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",

  // Safari on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",

  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
];

/**
 * Gets a random user agent from the predefined list.
 * @returns A random user agent string.
 */
function getRandomUserAgent(): string | undefined {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Gets or launches a shared Puppeteer browser instance.
 * @returns The browser instance.
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    // Determine the executable path
    let executablePath: string | undefined =
      process.env.PUPPETEER_EXECUTABLE_PATH;

    // Common paths to check if not provided via environment variable
    const commonPaths = [
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/google-chrome",
    ];

    if (!executablePath) {
      for (const path of commonPaths) {
        if (existsSync(path)) {
          executablePath = path;
          break;
        }
      }
    }

    // Launch browser with args suitable for containerized environments
    browser = await puppeteer.launch({
      headless: true,
      executablePath, // If undefined, puppeteer will use its own bundled chromium
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--ignore-certificate-errors",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-plugins-discovery",
        "--enable-features=NetworkService",
      ],
    });
  }
  return browser;
}

/**
 * Takes a screenshot of the visible viewport of the given domain by attempting to access it via HTTPS and HTTP.
 * @param job - The job containing the domain asset.
 * @returns A JSON string with the successful URL and base64-encoded screenshot.
 */
export default async function screenshotHandler(job: Job): Promise<string> {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  // Set full HD viewport (1920x1080) for consistent screenshot resolution
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  // Set a random user agent to avoid detection and bypass Cloudflare
  const userAgent = getRandomUserAgent();
  if (userAgent) {
    await page.setUserAgent(userAgent);
  }

  // Additional stealth measures to avoid detection
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
  });

  // Remove webdriver property to avoid detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Override plugins to appear more human-like
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  const domain = job.asset.value.trim();

  // Try HTTPS first, then HTTP
  const candidates = [`https://${domain}`, `http://${domain}`];

  let successUrl: string | null = null;

  for (const url of candidates) {
    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 15000,
        referer: "https://www.google.com/",
      });
      successUrl = page.url(); // Actual URL after redirect
      break;
    } catch (err) {
      console.error(`Error accessing: ${url}`, err);
    }
  }

  let screenshotBase64 = "";

  if (successUrl) {
    try {
      const screenshotBuffer = await page.screenshot({
        fullPage: false,
      });
      screenshotBase64 = Buffer.from(screenshotBuffer).toString("base64");
    } catch (err) {
      console.error(`Error taking screenshot for: ${successUrl}`, err);
      // screenshot remains empty string
    }
  }

  await page.close();

  // Return base64 encoded screenshot or empty if failed
  return JSON.stringify({
    url: successUrl || "",
    screenshot: screenshotBase64,
  });
}
