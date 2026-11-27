const WORKSPACE_MAX = 40;
const TITLE_MAX = 60;

const LABELS = {
  SUMMARY: 'attack-surface-summary',
  VULNERABILITY: 'vulnerability-report',
} as const;

/** Lowercase ASCII words joined by `-`; diacritics dropped (`đ` does not decompose, so it is mapped). */
function slugify(value: string, max: number): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-27-1430`, in UTC like the schedule crons. */
function stamp(now: Date): string {
  const day = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  return `${day}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

/**
 * The stored report's display name, e.g. `acme-corp-vulnerability-report-2026-11-27-1430.pdf`.
 * Not unique: the object key carries the artifact id.
 */
export function reportFileName(input: {
  workspaceName: string;
  type: 'SUMMARY' | 'VULNERABILITY' | 'QUERY';
  /** The saved query's name, for `QUERY`. */
  title?: string;
  now: Date;
}): string {
  const label =
    input.type === 'QUERY'
      ? slugify(input.title ?? '', TITLE_MAX) || 'query-report'
      : LABELS[input.type];
  return [slugify(input.workspaceName, WORKSPACE_MAX), label, stamp(input.now)]
    .filter(Boolean)
    .join('-')
    .concat('.pdf');
}
