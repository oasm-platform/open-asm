import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const consoleRoot = path.resolve(here, '../..');

/**
 * Evidence run for the OrcaRouter connect surface.
 *
 * The console is served by its own Vite dev server; every backend call is
 * answered inside the spec, so the run needs no database, no API process and
 * no seed data. The model list itself comes from the live OrcaRouter catalog,
 * fetched with ORCAROUTER_API_KEY.
 */
export default defineConfig({
  testDir: here,
  testMatch: 'evidence.spec.ts',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath: '/usr/bin/chromium',
      args: ['--no-sandbox', '--no-proxy-server'],
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
    cwd: consoleRoot,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
