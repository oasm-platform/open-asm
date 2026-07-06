/**
 * Centralized color and style tokens for the report PDF renderer.
 *
 * Values are ported 1:1 from the original Handlebars <style> blocks and
 * the hex maps used by the registered helpers (riskBg, severityBg,
 * severityColor, severityBorder, statusBg, statusColor, statusBorder, ...).
 */

export const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
} as const;

/** Tailwind-ish palette used by the severity/status badges in the templates. */
export const palette = {
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
  },
  orange: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
  },
  yellow: {
    50: '#fefce8',
    100: '#fef9c3',
    200: '#fde68a',
    300: '#fde047',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
    800: '#854d0e',
    900: '#92400e',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
  },
  green: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },
} as const;

/**
 * Risk-level styles (critical/high/medium/low) — mirrors the HBS helpers
 * riskBg / riskBadgeClass / riskTextClass.
 *
 * Used by summary-report discovery tables + target inventory.
 */
export const riskStyles: Record<
  'critical' | 'high' | 'medium' | 'low',
  { background: string; text: string; border?: string }
> = {
  critical: { background: palette.red[100], text: palette.red[700] },
  high: { background: palette.orange[100], text: palette.orange[700] },
  medium: { background: palette.yellow[100], text: palette.yellow[700] },
  low: { background: palette.green[100], text: palette.green[700] },
};

/**
 * Severity-level styles (info/low/medium/high/critical) — mirrors
 * severityBg / severityColor / severityBorder + the .sev-* / .text-* /
 * .dot-* / .bar-* classes in vulnerability-report.hbs.
 */
export const severityStyles: Record<
  'critical' | 'high' | 'medium' | 'low' | 'info',
  { background: string; text: string; border: string; dot: string }
> = {
  critical: {
    background: '#fef2f2',
    text: '#dc2626',
    border: '#fecaca',
    dot: '#dc2626',
  },
  high: {
    background: '#fff7ed',
    text: '#ea580c',
    border: '#fed7aa',
    dot: '#ea580c',
  },
  medium: {
    background: '#fffbeb',
    text: '#d97706',
    border: '#fde68a',
    dot: '#d97706',
  },
  low: {
    background: '#eff6ff',
    text: '#2563eb',
    border: '#bfdbfe',
    dot: '#2563eb',
  },
  info: {
    background: slate[100],
    text: slate[600],
    border: slate[300],
    dot: slate[500],
  },
};

/**
 * Status styles — mirrors statusBg / statusColor / statusBorder.
 * Keys match ScanStatus union values (lowercase enum strings).
 */
export const statusStyles: Record<
  | 'not_analyzed'
  | 'running'
  | 'done'
  | 'failed'
  | 'pending'
  | 'in_progress'
  | 'completed',
  { background: string; text: string; border: string }
> = {
  not_analyzed: {
    background: slate[100],
    text: slate[600],
    border: slate[300],
  },
  running: {
    background: '#fef9c3',
    text: palette.yellow[700],
    border: '#fde047',
  },
  done: {
    background: palette.green[100],
    text: palette.green[700],
    border: palette.green[200],
  },
  failed: {
    background: palette.red[100],
    text: palette.red[700],
    border: palette.red[200],
  },
  pending: {
    background: slate[100],
    text: slate[500],
    border: slate[300],
  },
  in_progress: {
    background: palette.blue[100],
    text: palette.blue[700],
    border: palette.blue[200],
  },
  completed: {
    background: palette.green[100],
    text: palette.green[700],
    border: palette.green[200],
  },
};

/** Human-readable labels — mirrors the statusLabel helper. */
export const statusLabels: Record<string, string> = {
  not_analyzed: 'Not Analyzed',
  running: 'Analyzing',
  done: 'Analyzed',
  failed: 'Failed',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

/**
 * Long-form impact prose — mirrors the severityImpact helper verbatim,
 * including the legacy uppercase-key behavior (the helper is called with
 * the lowercase enum value and therefore always falls through to LOW).
 * Preserved as-is for output parity.
 */
export const severityImpactCopy: Record<string, string> = {
  CRITICAL:
    'This vulnerability poses an immediate and severe risk to the affected system. Successful exploitation could lead to complete system compromise, unauthorized access to sensitive data, or full control over the affected infrastructure.',
  HIGH: 'This vulnerability presents a significant security risk. Exploitation could result in substantial data exposure, privilege escalation, or partial system compromise requiring immediate attention.',
  MEDIUM:
    'This vulnerability represents a moderate security concern. While exploitation may require specific conditions or combined attack vectors, it could lead to limited data access or system information disclosure.',
  LOW: 'This vulnerability presents a lower-tier security risk. Exploitation typically requires favorable conditions and may result in limited impact to system confidentiality, integrity, or availability.',
  INFO: 'This is an informational finding. It does not represent a direct security vulnerability but may provide useful context for security assessments.',
};
