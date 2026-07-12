import { Severity } from '@/common/enums/enum';

/**
 * Maps Severity enum values to UI text colors.
 */
export const SEVERITY_COLORS: Record<Severity, string> = {
  [Severity.INFO]: '#3b82f6',
  [Severity.LOW]: '#22c55e',
  [Severity.MEDIUM]: '#eab308',
  [Severity.HIGH]: '#f97316',
  [Severity.CRITICAL]: '#ef4444',
};

/**
 * Helper to get the display title for a severity value.
 */
function severityTitle(value: Severity): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Reusable severity boolean property definitions.
 *
 * Each severity level is a top-level boolean property so the form renderer
 * can render each as an individual Switch toggle.
 *
 * Usage — spread into any integration schema's `properties`:
 * ```ts
 * import { severityProperties } from './severity.schema';
 *
 * properties: {
 *   // ... other fields
 *   ...severityProperties,
 * }
 * ```
 */
/**
 * Group key for `ui:form:group`. Form renderers use this to group related fields
 * into a single section with a grid layout and a shared label.
 */
export const SEVERITY_GROUP = 'severity' as const;

export const severityProperties = {
  [Severity.CRITICAL]: {
    type: 'boolean' as const,
    title: severityTitle(Severity.CRITICAL),
    default: true,
    'ui:text-color': SEVERITY_COLORS[Severity.CRITICAL],
    'ui:form:group': SEVERITY_GROUP,
  },
  [Severity.HIGH]: {
    type: 'boolean' as const,
    title: severityTitle(Severity.HIGH),
    default: true,
    'ui:text-color': SEVERITY_COLORS[Severity.HIGH],
    'ui:form:group': SEVERITY_GROUP,
  },
  [Severity.MEDIUM]: {
    type: 'boolean' as const,
    title: severityTitle(Severity.MEDIUM),
    default: false,
    'ui:text-color': SEVERITY_COLORS[Severity.MEDIUM],
    'ui:form:group': SEVERITY_GROUP,
  },
  [Severity.LOW]: {
    type: 'boolean' as const,
    title: severityTitle(Severity.LOW),
    default: false,
    'ui:text-color': SEVERITY_COLORS[Severity.LOW],
    'ui:form:group': SEVERITY_GROUP,
  },
  [Severity.INFO]: {
    type: 'boolean' as const,
    title: severityTitle(Severity.INFO),
    default: false,
    'ui:text-color': SEVERITY_COLORS[Severity.INFO],
    'ui:form:group': SEVERITY_GROUP,
  },
} as const;
