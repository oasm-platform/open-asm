export type ReportOptions = {
  startDate?: Date;
  endDate?: Date;
  targetIds?: string[];
  vulnIds?: string[];
  minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
};

/** Lowest to highest; `minSeverity` keeps its own level and everything above. */
const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];

export const open = { field: 'isOpen', op: 'eq', value: 'true' } as const;

export const inPeriod = (field: string, from: Date, to: Date): unknown[] => [
  { field, op: 'gte', value: from.toISOString() },
  { field, op: 'lte', value: to.toISOString() },
];

/** `where` items on `vulnerabilities` for the user-chosen report filters. */
export function findingFilters(
  o: ReportOptions,
  use: { dates?: boolean; targets?: boolean; vulns?: boolean; severity?: boolean },
): unknown[] {
  const items: unknown[] = [];
  if (use.dates) {
    if (o.startDate) items.push({ field: 'firstSeen', op: 'gte', value: o.startDate.toISOString() });
    if (o.endDate) items.push({ field: 'firstSeen', op: 'lte', value: o.endDate.toISOString() });
  }
  if (use.targets && o.targetIds?.length) {
    items.push({ field: 'host.target.id', op: 'in', value: o.targetIds });
  }
  if (use.vulns && o.vulnIds?.length) {
    items.push({ field: 'id', op: 'in', value: o.vulnIds });
  }
  if (use.severity && o.minSeverity) {
    const min = SEVERITY_ORDER.indexOf(o.minSeverity.toLowerCase());
    if (min >= 0) items.push({ field: 'severity', op: 'in', value: SEVERITY_ORDER.slice(min) });
  }
  return items;
}
