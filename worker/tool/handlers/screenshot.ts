import puppeteer, { Browser } from 'puppeteer';
import type { Job } from '../../services/core-api/api';

// Shared browser instance to reuse across requests
let browser: Browser | null = null;

/**
 * Gets or launches a shared Puppeteer browser instance.
 * @returns The browser instance.
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    // Launch browser with args suitable for containerized environments
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--ignore-certificate-errors',
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

  // Set a common user agent to avoid detection
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  );

  const domain = job.asset.value.trim();

  // Try HTTPS first, then HTTP
  const candidates = [`https://${domain}`, `http://${domain}`];

  let successUrl: string | null = null;

  for (const url of candidates) {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });
      successUrl = page.url(); // Actual URL after redirect
      break;
    } catch (err) {
      console.error(`Error accessing: ${url}`, err);
    }
  }

  if (!successUrl) {
    await page.close();
    throw new Error(`Cannot access domain: ${domain}`);
  }

  const screenshotBuffer = await page.screenshot({
    fullPage: false,
  });

  await page.close();

  // Return base64 encoded screenshot
  const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');
  return JSON.stringify({
    url: successUrl,
    screenshot: screenshotBase64,
  });
}
