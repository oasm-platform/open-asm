import type { QueryBatchInput } from '@/modules/attack-surface-query/domain/query.schema';
import { findingFilters, inPeriod, open, type ReportOptions } from '../../shared/asq-filters';
import { severityMatrix } from '../../shared/severity-matrix';
import { weekStart } from '../../shared/report-header';

const and = (items: unknown[]) => ({ logic: 'and', items });
const eq = (field: string, value: string) => ({ field, op: 'eq', value });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 10;
/** Same cap as the vulnerability template's per-target matrix. */
const TARGETS_LIMIT = 10_000;
/** Open findings read to attribute risk to a new port (the mapper joins them on host + port). */
const PORT_RISK_LIMIT = 10_000;

export function summaryQueries(o: ReportOptions, now: Date): QueryBatchInput[] {
  const thisWeek = weekStart(now);
  const lastWeek = new Date(thisWeek.getTime() - WEEK_MS);
  const lastWeekItems = inPeriod('firstSeen', lastWeek, thisWeek);
  const sinceMonday = inPeriod('firstSeen', thisWeek, now);
  const userDates = findingFilters(o, { dates: true });
  const datesAndTargets = findingFilters(o, { dates: true, targets: true });

  /**
   * Today's `getCountForWorkspace`: the total honours the user's dates (not the
   * targets); the change is that total minus the rows created last week.
   */
  const count = (from: string, where: unknown[] = []) => ({
    from,
    aggregate: {
      total: userDates.length ? { fn: 'count', where: and(userDates) } : { fn: 'count' },
      lastWeek: { fn: 'count', where: and(lastWeekItems) },
    },
    ...(where.length ? { where: and(where) } : {}),
  });

  const a = {
    targets: count('targets'),
    hosts: count('hosts', [{ field: 'kind', op: 'neq', value: 'repository' }]),
    services: count('services'),
    // Score + distribution: `current` honours the dates, `lastWeek` replaces them (targets kept).
    severity: {
      from: 'vulnerabilities',
      groupBy: ['severity'],
      aggregate: {
        current: userDates.length ? { fn: 'count', where: and(userDates) } : { fn: 'count' },
        lastWeek: { fn: 'count', where: and(lastWeekItems) },
      },
      where: and([open, ...findingFilters(o, { targets: true })]),
    },
    // Today's summary trend had no filters besides "open".
    trend: {
      from: 'vulnerabilities',
      groupBy: [{ field: 'firstSeen', bucket: 'day' }],
      aggregate: { n: { fn: 'count' } },
      where: and([open]),
      window: { since: 'now-30d' },
      fill: true,
    },
    byTarget: {
      from: 'vulnerabilities',
      groupBy: ['host.target.value', 'host.target.type'],
      aggregate: severityMatrix,
      where: and([open, ...datesAndTargets]),
      orderBy: [{ field: 'total', dir: 'desc' }],
      limit: TARGETS_LIMIT,
    },
    newFindings: {
      from: 'vulnerabilities',
      select: ['name', 'severity', 'cvssScore', 'host.value', 'firstSeen'],
      where: and([open, { field: 'severity', op: 'neq', value: 'info' }, ...datesAndTargets]),
      orderBy: [{ field: 'firstSeen', dir: 'desc' }],
      limit: LIST_LIMIT,
    },
  };

  const newest = [{ field: 'firstSeen', dir: 'desc' }];
  const b = {
    newDomains: {
      from: 'targets',
      select: ['value', 'firstSeen'],
      where: and([eq('type', 'DOMAIN'), ...sinceMonday]),
      orderBy: newest,
      limit: LIST_LIMIT,
    },
    newIps: {
      from: 'targets',
      select: ['value', 'firstSeen'],
      where: and([eq('type', 'IP'), ...sinceMonday]),
      orderBy: newest,
      limit: LIST_LIMIT,
    },
    newPorts: {
      from: 'services',
      select: ['port', 'value', 'firstSeen', 'target.value', 'host.id'],
      where: and(sinceMonday),
      orderBy: newest,
      limit: LIST_LIMIT,
    },
    newTech: {
      from: 'tags',
      select: ['tag', 'firstSeen', 'service.target.value'],
      where: and(sinceMonday),
      orderBy: newest,
      limit: LIST_LIMIT,
    },
    // Risk of the new domains/IPs: open findings under each target created this week.
    discoveryRisk: {
      from: 'vulnerabilities',
      groupBy: ['host.target.value'],
      aggregate: { n: { fn: 'count' } },
      where: and([
        open,
        { field: 'host.target.type', op: 'in', value: ['DOMAIN', 'IP'] },
        ...inPeriod('host.target.firstSeen', thisWeek, now),
      ]),
      limit: TARGETS_LIMIT,
    },
    // Risk of the new ports: open findings on hosts that have a service first seen this week.
    portRisk: {
      from: 'vulnerabilities',
      select: ['host.id', 'ports'],
      where: and([open, { relation: 'host.services', quantifier: 'some', where: and(sinceMonday) }]),
      limit: PORT_RISK_LIMIT,
    },
  };

  const consistent = { consistent: true };
  return [
    { queries: a, options: consistent },
    { queries: b, options: consistent },
  ] as unknown as QueryBatchInput[];
}
