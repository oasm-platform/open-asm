import type { QueryBatchResult } from '@/modules/attack-surface-query/domain/query.types';
import { StatisticService } from '@/modules/statistic/statistic.service';
import { summaryToData } from './to-data';

const now = new Date(2026, 10, 26, 10, 0, 0);
const ctx = { workspaceName: 'Acme', now, options: {} };

const batch = (data: Record<string, unknown>): QueryBatchResult =>
  ({ data, meta: { now: now.toISOString(), tookMs: 1, queries: {} } }) as unknown as QueryBatchResult;
const rows = (r: unknown[]) => ({ rows: r, nextCursor: null, truncated: false });

const emptyResults = () => [
  batch({
    targets: rows([{ total: 0, lastWeek: 0 }]),
    hosts: rows([{ total: 0, lastWeek: 0 }]),
    services: rows([{ total: 0, lastWeek: 0 }]),
    severity: rows([]),
    trend: rows([]),
    byTarget: rows([]),
    newFindings: rows([]),
  }),
  batch({
    newDomains: rows([]),
    newIps: rows([]),
    newPorts: rows([]),
    newTech: rows([]),
    discoveryRisk: rows([]),
    portRisk: rows([]),
  }),
];

describe('summaryToData', () => {
  it('empty results: zeros, empty lists, percent 0, trends of 31 and 8 zeros', () => {
    const d = summaryToData(emptyResults(), ctx);
    expect(d.weekly).toEqual({
      totalTargets: 0,
      targetsChange: 0,
      totalAssets: 0,
      assetsChange: 0,
      totalServices: 0,
      servicesChange: 0,
      securityScore: StatisticService.calculateSecurityScore({} as never),
      scoreChange: 0,
    });
    expect(d.riskDistribution.map((r) => [r.level, r.count, r.percent])).toEqual([
      ['critical', 0, 0],
      ['high', 0, 0],
      ['medium', 0, 0],
      ['low', 0, 0],
    ]);
    expect(d.vulnerabilityTrends.last30Days).toEqual(new Array(31).fill(0));
    expect(d.vulnerabilityTrends.last7Days).toEqual(new Array(8).fill(0));
    expect(d.newDiscoveries).toEqual({ domains: [], ipAddresses: [], ports: [], technologies: [] });
    expect(d.newFindings).toEqual([]);
    expect(d.vulnerabilityByTarget).toEqual([]);
  });

  it('keeps the header and workspace name', () => {
    const d = summaryToData(emptyResults(), ctx);
    expect(d).toMatchObject({ reportTitle: 'Attack Surface Discovery Report', workspaceName: 'Acme', year: 2026 });
  });

  it('maps a full fixture exactly', () => {
    const [a, b] = emptyResults();
    const trendRows = Array.from({ length: 31 }, (_, i) => ({ n: i === 30 ? 4 : 0 }));
    const results = [
      batch({
        ...a.data,
        targets: rows([{ total: 5, lastWeek: 2 }]),
        hosts: rows([{ total: '10', lastWeek: '4' }]),
        services: rows([{ total: 7, lastWeek: 7 }]),
        severity: rows([
          { severity: 'critical', current: 1, lastWeek: 0 },
          { severity: 'high', current: 3, lastWeek: 2 },
          { severity: 'low', current: 6, lastWeek: 1 },
          { severity: 'info', current: 10, lastWeek: 0 },
        ]),
        trend: rows(trendRows),
        byTarget: rows([
          { host: { target: { value: 'a.com', type: 'DOMAIN' } }, total: 4, critical: 1, high: 3, medium: 0, low: 0, info: 0 },
        ]),
        newFindings: rows([
          { name: 'XSS', severity: 'high', cvssScore: '7.5', host: { value: 'x.a.com' }, firstSeen: '2026-11-24T12:00:00.000Z' },
          { name: 'Odd', severity: 'low', cvssScore: null, host: null, firstSeen: '2026-11-24T12:00:00.000Z' },
        ]),
      }),
      batch({
        ...b.data,
        newDomains: rows([{ value: 'a.com', firstSeen: '2026-11-24T12:00:00.000Z' }, { value: 'b.com', firstSeen: '2026-11-24T12:00:00.000Z' }]),
        newIps: rows([{ value: '1.2.3.4', firstSeen: '2026-11-24T12:00:00.000Z' }]),
        discoveryRisk: rows([{ host: { target: { value: 'a.com' } }, n: 10 }]),
        newPorts: rows([{ port: 8080, value: 'x.a.com:8080', firstSeen: '2026-11-24T12:00:00.000Z', target: { value: 'a.com' }, host: { id: 'h1' } }]),
        portRisk: rows([
          { host: { id: 'h1' }, ports: ['8080'] },
          { host: { id: 'h1' }, ports: ['443', '8080'] },
          { host: { id: 'h1' }, ports: ['443'] },
          { host: { id: 'h2' }, ports: ['8080'] },
          { host: { id: 'h1' }, ports: null },
        ]),
        newTech: rows([{ tag: 'nginx', firstSeen: '2026-11-24T12:00:00.000Z', service: { target: { value: 'a.com' } } }]),
      }),
    ];
    const d = summaryToData(results, ctx);
    const score = StatisticService.calculateSecurityScore({ critical: 1, high: 3, medium: 0, low: 6, info: 10 } as never);
    const lastScore = StatisticService.calculateSecurityScore({ critical: 0, high: 2, medium: 0, low: 1, info: 0 } as never);

    expect(d.weekly).toEqual({
      totalTargets: 5,
      targetsChange: 3,
      totalAssets: 10,
      assetsChange: 6,
      totalServices: 7,
      servicesChange: 0,
      securityScore: score,
      scoreChange: score - lastScore,
    });
    // Percent is over all severities including info, as today.
    expect(d.riskDistribution).toEqual([
      { level: 'critical', count: 1, percent: 5, color: '#dc2626' },
      { level: 'high', count: 3, percent: 15, color: '#f97316' },
      { level: 'medium', count: 0, percent: 0, color: '#eab308' },
      { level: 'low', count: 6, percent: 30, color: '#3b82f6' },
    ]);
    expect(d.vulnerabilityTrends.last30Days[30]).toBe(4);
    expect(d.vulnerabilityTrends.last7Days).toHaveLength(8);
    expect(d.vulnerabilityByTarget).toEqual([
      { target: 'a.com', type: 'DOMAIN', critical: 1, high: 3, medium: 0, low: 0, total: 4 },
    ]);
    expect(d.newFindings).toEqual([
      { title: 'XSS', severity: 'high', cvss: 7.5, asset: 'x.a.com', discovered: '24/11/2026' },
      { title: 'Odd', severity: 'low', cvss: 0, asset: 'Unknown', discovered: '24/11/2026' },
    ]);
    expect(d.newDiscoveries.domains).toEqual([
      { identifier: 'a.com', discovered: '24/11/2026', provider: 'OpenASM', riskLevel: 'critical' },
      { identifier: 'b.com', discovered: '24/11/2026', provider: 'OpenASM', riskLevel: 'low' },
    ]);
    expect(d.newDiscoveries.ipAddresses).toEqual([
      { identifier: '1.2.3.4', discovered: '24/11/2026', provider: 'OpenASM', riskLevel: 'low' },
    ]);
    // Only the two findings on h1 that list port 8080 count: medium.
    expect(d.newDiscoveries.ports).toEqual([
      { port: 8080, service: 'x.a.com:8080', discovered: '24/11/2026', target: 'a.com', riskLevel: 'medium' },
    ]);
    expect(d.newDiscoveries.technologies).toEqual([
      { name: 'nginx', discovered: '24/11/2026', target: 'a.com', category: 'Technology' },
    ]);
  });

  it('a failed query throws', () => {
    const [a, b] = emptyResults();
    const bad = batch({ ...a.data, severity: { error: { code: 'QUERY_TIMEOUT', message: 'slow' } } });
    expect(() => summaryToData([bad, b], ctx)).toThrow();
  });
});
