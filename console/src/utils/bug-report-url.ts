/** Issue form in `.github/ISSUE_TEMPLATE/` the link opens. */
const BUG_REPORT_TEMPLATE = 'bug-report.yml';

/**
 * GitHub rejects overly long URLs, and logs grow ~3x once percent-encoded, so
 * prefilled logs are cut to this many characters.
 */
export const MAX_BUG_REPORT_LOGS_LENGTH = 2000;

const TRUNCATED_MARKER = '\n… (truncated)';

/** Prefill for the template fields, addressed by their `id`. */
export interface BugReport {
  title?: string;
  whatHappened?: string;
  /** Must match an option of the `component` dropdown. */
  component?: string;
  logs?: string;
}

/**
 * Maps a user agent to an option of the template's `browsers` dropdown.
 * Order matters: Edge and Opera UAs also contain "Chrome", and Chrome's
 * also contains "Safari".
 */
export function detectBrowser(userAgent: string): string {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Other';
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Other';
}

const truncateLogs = (logs: string) =>
  logs.length > MAX_BUG_REPORT_LOGS_LENGTH
    ? logs.slice(0, MAX_BUG_REPORT_LOGS_LENGTH) + TRUNCATED_MARKER
    : logs;

/**
 * Link to GitHub's new-issue page with the bug report form prefilled. Fields
 * are addressed by their `id` in the template.
 */
export function buildBugReportUrl(
  gitRepoUrl: string,
  {
    version,
    userAgent = navigator.userAgent,
    title,
    whatHappened,
    component,
    logs,
  }: BugReport & { version?: string | null; userAgent?: string } = {},
): string {
  const params = new URLSearchParams({ template: BUG_REPORT_TEMPLATE });
  if (title) params.set('title', title);
  if (whatHappened) params.set('what-happened', whatHappened);
  if (component) params.set('component', component);
  if (version) params.set('version', version);
  params.set('browsers', detectBrowser(userAgent));
  if (logs) params.set('logs', truncateLogs(logs));
  return `${gitRepoUrl}/issues/new?${params.toString()}`;
}
