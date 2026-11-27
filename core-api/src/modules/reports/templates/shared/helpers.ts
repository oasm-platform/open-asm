/**
 * Pure helpers ported 1:1 from the registered Handlebars helpers in
 * reports.service.ts. Behaviour must match the original HBS output exactly
 * so the rendered PDF stays visually identical after the refactor.
 */

import {
  riskStyles,
  severityImpactCopy,
  severityStyles,
  statusLabels,
  statusStyles,
} from './theme';

/** `(value / max * 100).toFixed(1) + '%'` — the `percentage` helper. */
export function percentage(value: number, max: number): string {
  return ((value / max) * 100).toFixed(1) + '%';
}

/** `str.toUpperCase()` — the `toUpper` helper. */
export function toUpper(value: string): string {
  return (value ?? '').toUpperCase();
}

/** `str.toLowerCase()` — the `toLowerCase` helper. */
export function toLowerCase(value: string): string {
  return (value ?? '').toLowerCase();
}

/** `arr.join(separator)` — the `join` helper. */
export function join(arr: string[] | null | undefined, separator = ', '): string {
  if (!Array.isArray(arr)) return '';
  return arr.join(separator);
}

/** `a - b` — the `sub` helper. */
export function sub(a: number, b: number): number {
  return a - b;
}

/**
 * `DD/MM/YYYY` from a date string / Date. Null/NaN -> '-'.
 * Mirrors the `formatDate` helper exactly.
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Inline-style object for a risk badge (summary discovery tables). */
export function riskBadgeStyle(level: string): { backgroundColor: string; color: string } {
  const entry = (riskStyles as Record<string, { background: string; text: string }>)[level];
  if (!entry) {
    const fallback = riskStyles.low;
    return { backgroundColor: fallback.background, color: fallback.text };
  }
  return { backgroundColor: entry.background, color: entry.text };
}

/** Inline-style object for the risk text badge (summary target inventory). */
export function riskTextStyle(level: string): { color: string; backgroundColor: string } {
  return riskBadgeStyle(level);
}

/** Inline-style object for a severity badge (summary new-findings table). */
export function severityBadgeStyle(
  severity: string,
): { backgroundColor: string; color: string; borderColor: string } {
  const entry = (severityStyles as Record<string, { background: string; text: string; border: string }>)[
    severity
  ];
  if (!entry) {
    const fallback = severityStyles.low;
    return {
      backgroundColor: fallback.background,
      color: fallback.text,
      borderColor: fallback.border,
    };
  }
  return {
    backgroundColor: entry.background,
    color: entry.text,
    borderColor: entry.border,
  };
}

/** Inline-style object for a status badge. */
export function statusBadgeStyle(
  status: string,
): { backgroundColor: string; color: string; borderColor: string } {
  const entry = (statusStyles as Record<string, { background: string; text: string; border: string }>)[
    status
  ];
  if (!entry) {
    const fallback = statusStyles.pending;
    return {
      backgroundColor: fallback.background,
      color: fallback.text,
      borderColor: fallback.border,
    };
  }
  return {
    backgroundColor: entry.background,
    color: entry.text,
    borderColor: entry.border,
  };
}

/** Human-readable status label — mirrors the `statusLabel` helper. */
export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

/**
 * Long-form impact prose — mirrors the `severityImpact` helper verbatim.
 *
 * NOTE: the original helper keyed on UPPERCASE severity keys while being
 * called with the lowercase enum value, so it always fell through to LOW.
 * We preserve that exact behaviour here for output parity.
 */
export function severityImpact(severity: string): string {
  return severityImpactCopy[severity] ?? severityImpactCopy.LOW;
}
