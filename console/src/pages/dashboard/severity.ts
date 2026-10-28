/** Severity text colours on the dashboard, in the hues of SeverityBadge. */
export const SEVERITY_TEXT_CLASS = {
  critical: 'text-red-500',
  high: 'text-orange-500',
  medium: 'text-yellow-500',
  low: 'text-blue-500',
  info: 'text-muted-foreground',
} as const;

/** Severity fills for dashboard bars, in the same hues. */
export const SEVERITY_BG_CLASS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  info: 'bg-muted-foreground/40',
} as const;
