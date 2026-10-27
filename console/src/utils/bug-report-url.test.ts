import { describe, expect, it } from 'vitest';
import {
  buildBugReportUrl,
  detectBrowser,
  MAX_BUG_REPORT_LOGS_LENGTH,
} from './bug-report-url';

const UA = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  firefox:
    'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('detectBrowser', () => {
  it.each([
    [UA.chrome, 'Chrome'],
    [UA.edge, 'Microsoft Edge'],
    [UA.opera, 'Other'],
    [UA.firefox, 'Firefox'],
    [UA.safari, 'Safari'],
    ['curl/8.0', 'Other'],
  ])('maps %s to %s', (userAgent, expected) => {
    expect(detectBrowser(userAgent)).toBe(expected);
  });
});

describe('buildBugReportUrl', () => {
  const repo = 'https://github.com/oasm-platform/open-asm';

  it('prefills template, version and browser', () => {
    const url = new URL(
      buildBugReportUrl(repo, { version: '1.4.0', userAgent: UA.edge }),
    );
    expect(url.origin + url.pathname).toBe(`${repo}/issues/new`);
    expect(url.searchParams.get('template')).toBe('bug-report.yml');
    expect(url.searchParams.get('version')).toBe('1.4.0');
    expect(url.searchParams.get('browsers')).toBe('Microsoft Edge');
    expect(url.searchParams.has('environment')).toBe(false);
  });

  it('prefills report fields by template id', () => {
    const url = new URL(
      buildBugReportUrl(repo, {
        userAgent: UA.chrome,
        title: 'Bug: nuclei job failed',
        whatHappened: 'Job ID: 1',
        component: 'Job Management',
        logs: 'boom',
      }),
    );
    expect(url.searchParams.get('title')).toBe('Bug: nuclei job failed');
    expect(url.searchParams.get('what-happened')).toBe('Job ID: 1');
    expect(url.searchParams.get('component')).toBe('Job Management');
    expect(url.searchParams.get('logs')).toBe('boom');
  });

  it('truncates long logs', () => {
    const url = new URL(
      buildBugReportUrl(repo, {
        userAgent: UA.chrome,
        logs: 'x'.repeat(MAX_BUG_REPORT_LOGS_LENGTH + 500),
      }),
    );
    const logs = url.searchParams.get('logs') ?? '';
    expect(logs.startsWith('x'.repeat(MAX_BUG_REPORT_LOGS_LENGTH))).toBe(true);
    expect(logs.endsWith('(truncated)')).toBe(true);
    expect(logs.length).toBeLessThan(MAX_BUG_REPORT_LOGS_LENGTH + 50);
  });

  it('omits version when unknown', () => {
    const url = new URL(
      buildBugReportUrl(repo, { version: null, userAgent: UA.chrome }),
    );
    expect(url.searchParams.has('version')).toBe(false);
  });
});
