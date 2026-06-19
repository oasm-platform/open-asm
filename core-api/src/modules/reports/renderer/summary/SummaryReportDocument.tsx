import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { ReportData } from '../../types/report-data.type';
import { toUpper } from '../helpers';

import { slate, palette } from '../theme';
import { CoverPage } from '../components/CoverPage';
import { ReportHeader } from '../components/ReportHeader';
import { ReportFooter } from '../components/ReportFooter';
import { ReportInfo } from '../components/ReportInfo';
import { SectionHeader } from '../components/SectionHeader';
import { MetricCard } from '../components/MetricCard';
import { SeverityDistribution } from '../components/SeverityDistribution';
import { SeverityBadge, RiskBadge } from '../components/Badge';
import { BarChart } from '../components/BarChart';

// Ensure fonts are registered
import '../fonts';

const styles = StyleSheet.create({
  contentPage: {
    paddingHorizontal: 56,
    paddingTop: 56,
    paddingBottom: 48,
    fontFamily: 'Inter',
    fontSize: 9,
    color: slate[800],
    lineHeight: 1.6,
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
  },

  // ── Tables ──────────────────────────────────────────────────────
  tableHeader: {
    backgroundColor: slate[100],
    borderBottomWidth: 1,
    borderBottomColor: slate[300],
    display: 'flex',
    flexDirection: 'row',
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: slate[200],
    display: 'flex',
    flexDirection: 'row',
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  th: {
    fontSize: 7,
    fontWeight: '700',
    color: slate[600],
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: 'Inter',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: {
    fontSize: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontFamily: 'Inter',
    color: slate[800],
  },
  tdMono: {
    fontFamily: 'JetBrains Mono',
    fontSize: 8,
  },
  tdCenter: {
    textAlign: 'center',
  },

  // ── Badges ──────────────────────────────────────────────────────
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: '600',
    borderWidth: 1,
    fontFamily: 'Inter',
    textAlign: 'center',
    alignSelf: 'center',
  },
  badgeCell: {
    display: 'flex',
    justifyContent: 'center',
  },
  // ── Info / Activity boxes ───────────────────────────────────────
  infoBox: {
    backgroundColor: slate[50],
    padding: 8,
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    fontSize: 8,
    color: slate[600],
    fontFamily: 'Inter',
  },

  // ── Sections ────────────────────────────────────────────────────
  section: {
    marginBottom: 16,
    break: 'avoid',
  },
  noData: {
    fontSize: 8,
    color: slate[400],
    textAlign: 'center',
    paddingVertical: 16,
    fontFamily: 'Inter',
  },

  // ── Panels ──────────────────────────────────────────────────────
  panel: {
    padding: 12,
    borderWidth: 1,
    borderColor: slate[200],
    backgroundColor: '#fafbfc',
  },
  panelTitle: {
    fontSize: 8,
    fontWeight: '700',
    color: slate[600],
    marginBottom: 8,
    fontFamily: 'Inter',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Bar chart ───────────────────────────────────────────────────
  barRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 64,
    marginBottom: 4,
  },
  bar: {
    flex: 1,
    backgroundColor: slate[700],
    borderRadius: 2,
    minHeight: 4,
  },
  barLabel: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: slate[400],
    fontFamily: 'Inter',
  },

  // ── Risk distribution ───────────────────────────────────────────
  riskDistRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  riskDistLabel: {
    fontSize: 8,
    width: 64,
    fontWeight: '500',
    color: slate[600],
    fontFamily: 'Inter',
  },
  riskDistBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: slate[200],
    overflow: 'hidden',
  },
  riskDistBar: {
    height: '100%',
    borderRadius: 4,
  },
  riskDistCount: {
    fontSize: 8,
    fontWeight: '600',
    color: slate[700],
    width: 32,
    textAlign: 'right',
    fontFamily: 'Inter',
  },
  riskDistPercent: {
    fontSize: 7,
    color: slate[400],
    width: 36,
    textAlign: 'right',
    fontFamily: 'Inter',
  },

  // ── Misc ────────────────────────────────────────────────────────
  subtitle: {
    fontSize: 7,
    fontWeight: '600',
    color: slate[500],
    marginBottom: 8,
    fontFamily: 'Inter',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ── Helpers ──────────────────────────────────────────────────────

// ============ Section Components ============

/** Section 01: Executive Summary — key metrics + activity */
const ExecutiveSummary: React.FC<{ data: ReportData }> = ({ data }) => {
  const w = data.weekly;
  return (
    <View style={styles.section}>
      <SectionHeader number="01" title="Executive Summary" />

      {/* Key metrics row 1 — with change indicators */}
      <View style={[styles.row, { marginBottom: 8 }]}>
        <MetricCard
          label="Total Targets"
          value={w.totalTargets}
          change={w.targetsChange}
        />
        <MetricCard
          label="Total Assets"
          value={w.totalAssets}
          change={w.assetsChange}
        />
        <MetricCard
          label="Total Services"
          value={w.totalServices}
          change={w.servicesChange}
        />
        <MetricCard
          label="Security Score"
          value={w.securityScore}
          change={w.scoreChange}
        />
      </View>
    </View>
  );
};

/** Section 02: Severity Distribution */
const SeverityOverview: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="02" title="Severity Distribution" />
    <SeverityDistribution
      severityDistribution={data.riskDistribution.map((r) => ({
        level: r.level,
        count: r.count,
        percent: r.percent,
      }))}
    />
  </View>
);

/** Section 03: Vulnerability Trend (Last 30 Days) */
const VulnerabilityTrend: React.FC<{ data: ReportData }> = ({ data }) => {
  const trends = data.vulnerabilityTrends;

  return (
    <View style={styles.section}>
      <SectionHeader number="03" title="Vulnerability Trend (Last 30 Days)" />
      <View style={styles.row}>
        {/* Daily bar chart */}
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={[styles.panelTitle, { marginBottom: 8 }]}>Daily Vulnerabilities</Text>
          <BarChart data={trends.last30Days} showLabels />
        </View>

        {/* Risk distribution */}
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Risk Distribution</Text>
          {data.riskDistribution.map((item) => (
            <View key={item.level} style={styles.riskDistRow}>
              <Text style={styles.riskDistLabel}>{toUpper(item.level)}</Text>
              <View style={styles.riskDistBarBg}>
                <View
                  style={[
                    styles.riskDistBar,
                    { width: `${item.percent}%`, backgroundColor: item.color },
                  ]}
                />
              </View>
              <Text style={styles.riskDistCount}>{item.count}</Text>
              <Text style={styles.riskDistPercent}>
                {item.percent.toFixed(1)}%
              </Text>
            </View>
          ))}
          <Text
            style={{
              fontSize: 8,
              color: slate[500],
              marginTop: 8,
              fontFamily: 'Inter',
            }}
          >
            Avg: {trends.avgPerWeek} vulns/week
          </Text>
        </View>
      </View>
    </View>
  );
};

// ── Reusable table for discoveries ───────────────────────────────

const DiscoveriesTable: React.FC<{
  title: string;
  headers: { label: string; width: string; align?: string }[];
  rows: unknown[];
  renderCell: (key: string, item: unknown) => React.ReactNode;
}> = ({ title, headers, rows, renderCell }) => {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontSize: 8,
          fontWeight: '700',
          color: slate[600],
          marginBottom: 4,
          fontFamily: 'Inter',
        }}
      >
        {title}
      </Text>
      <View>
        <View style={styles.tableHeader}>
          {headers.map((h) => (
            <Text
              key={h.label}
              style={{
                ...styles.th,
                width: h.width,
                ...(h.align === 'center' ? styles.tdCenter : {}),
              }}
            >
              {h.label}
            </Text>
          ))}
        </View>
        {rows.map((item, i) => (
          <View
            key={i}
            style={[
              styles.tableRow,
              ...(i % 2 === 1 ? [styles.tableRowAlt] : []),
            ]}
          >
            {headers.map((h) => (
              <View
                key={h.label}
                style={{
                  ...styles.td,
                  width: h.width,
                  ...(h.align === 'center'
                    ? { ...styles.tdCenter, ...styles.badgeCell }
                    : {}),
                }}
              >
                {typeof renderCell(h.label, item) === 'string' ? (
                  <Text>{renderCell(h.label, item) as string}</Text>
                ) : (
                  renderCell(h.label, item)
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

// ============ Section 04: Newly Discovered Assets ================

const NewDiscoveries: React.FC<{ data: ReportData }> = ({ data }) => {
  const d = data.newDiscoveries;
  const hasAny =
    d.domains.length ||
    d.ipAddresses.length ||
    d.ports.length ||
    d.technologies.length;

  return (
    <View style={styles.section}>
      <SectionHeader number="04" title="Newly Discovered Assets" />
      {!hasAny ? (
        <Text style={styles.noData}>No new discoveries in this period</Text>
      ) : (
        <>
          <DiscoveriesTable
            title="New Domains"
            headers={[
              { label: 'Domain', width: '35%' },
              { label: 'Discovered', width: '20%', align: 'center' },
              { label: 'Provider', width: '20%', align: 'center' },
              { label: 'Risk', width: '25%', align: 'center' },
            ]}
            rows={d.domains}
            renderCell={(key, item) => {
              const domain = item as {
                identifier: string;
                discovered: string;
                provider: string;
                riskLevel: string;
              };
              if (key === 'Domain') return domain.identifier;
              if (key === 'Discovered') return domain.discovered;
              if (key === 'Provider') return domain.provider;
              if (key === 'Risk') return <RiskBadge level={domain.riskLevel} />;
              return '';
            }}
          />
          <DiscoveriesTable
            title="New IP Addresses"
            headers={[
              { label: 'IP Address', width: '35%' },
              { label: 'Discovered', width: '20%', align: 'center' },
              { label: 'Provider', width: '20%', align: 'center' },
              { label: 'Risk', width: '25%', align: 'center' },
            ]}
            rows={d.ipAddresses}
            renderCell={(key, item) => {
              const ip = item as {
                identifier: string;
                discovered: string;
                provider: string;
                riskLevel: string;
              };
              if (key === 'IP Address') return ip.identifier;
              if (key === 'Discovered') return ip.discovered;
              if (key === 'Provider') return ip.provider;
              if (key === 'Risk') return <RiskBadge level={ip.riskLevel} />;
              return '';
            }}
          />
          <DiscoveriesTable
            title="New Open Ports"
            headers={[
              { label: 'Port', width: '12%' },
              { label: 'Service', width: '20%' },
              { label: 'Discovered', width: '20%', align: 'center' },
              { label: 'Target', width: '28%' },
              { label: 'Risk', width: '20%', align: 'center' },
            ]}
            rows={d.ports}
            renderCell={(key, item) => {
              const p = item as {
                port: number;
                service: string;
                discovered: string;
                target: string;
                riskLevel: string;
              };
              if (key === 'Port')
                return (
                  <Text style={styles.tdMono}>{String(p.port)}</Text>
                );
              if (key === 'Service') return p.service;
              if (key === 'Discovered') return p.discovered;
              if (key === 'Target')
                return (
                  <Text style={styles.tdMono}>{p.target}</Text>
                );
              if (key === 'Risk') return <RiskBadge level={p.riskLevel} />;
              return '';
            }}
          />
          <DiscoveriesTable
            title="New Technologies Detected"
            headers={[
              { label: 'Technology', width: '30%' },
              { label: 'Category', width: '20%', align: 'center' },
              { label: 'Discovered', width: '20%', align: 'center' },
              { label: 'Target', width: '30%' },
            ]}
            rows={d.technologies}
            renderCell={(key, item) => {
              const t = item as {
                name: string;
                category: string;
                discovered: string;
                target: string;
              };
              if (key === 'Technology') return t.name;
              if (key === 'Category') return t.category;
              if (key === 'Discovered') return t.discovered;
              if (key === 'Target')
                return (
                  <Text style={styles.tdMono}>{t.target}</Text>
                );
              return '';
            }}
          />
        </>
      )}
    </View>
  );
};

// ============ Section 05: New Vulnerabilities Discovered ==========

const NewFindings: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="05" title="New Vulnerabilities Discovered" />
    {data.newFindings.length === 0 ? (
      <Text style={styles.noData}>No new vulnerabilities in this period</Text>
    ) : (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: '28%' }]}>Vulnerability</Text>
          <Text
            style={[
              styles.th,
              { width: '18%', textAlign: 'center' as const },
            ]}
          >
            Severity
          </Text>
          <Text
            style={[
              styles.th,
              { width: '8%', textAlign: 'center' as const },
            ]}
          >
            CVSS
          </Text>
          <Text style={[styles.th, { width: '30%' }]}>Affected Asset</Text>
          <Text style={[styles.th, { width: '16%' }]}>Discovered</Text>
        </View>
        {data.newFindings.map((f, i) => (
          <View
            key={i}
            style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}
          >
            <Text style={[styles.td, { width: '28%' }]}>{f.title}</Text>
            <View
              style={[
                styles.td,
                styles.badgeCell,
                { width: '18%' },
              ]}
            >
              <SeverityBadge severity={f.severity} />
            </View>
            <View
              style={[
                styles.td,
                styles.tdMono,
                styles.badgeCell,
                { width: '8%' },
              ]}
            >
              <Text style={{ textAlign: 'center' }}>{f.cvss}</Text>
            </View>
            <View
              style={[
                styles.td,
                styles.tdMono,
                styles.badgeCell,
                { width: '30%' },
              ]}
            >
              <Text>{f.asset}</Text>
            </View>
            <View
              style={[
                styles.td,
                styles.badgeCell,
                { width: '16%' },
              ]}
            >
              <Text style={{ fontSize: 7, color: slate[500] }}>{f.discovered}</Text>
            </View>
          </View>
        ))}
      </View>
    )}
  </View>
);

// ============ Section 06: Vulnerability by Target =================

const VulnByTarget: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="06" title="Vulnerability by Target" />
    {data.vulnerabilityByTarget.length === 0 ? (
      <Text style={styles.noData}>No vulnerabilities found</Text>
    ) : (
      <View style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.vulnerabilityByTarget.map((t, i) => (
          <View key={i}>
            <Text style={{ fontSize: 9, marginBottom: 6, fontFamily: 'Inter' }}>
              <Text style={{ fontWeight: '700', fontFamily: 'JetBrains Mono', color: slate[900] }}>{t.target}</Text>
              <Text style={{ fontSize: 7, color: slate[400] }}>{`  ${t.type}`}</Text>
            </Text>
            <View style={{ display: 'flex', flexDirection: 'row', gap: 12, marginBottom: 4 }}>
              {t.critical > 0 && (
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.red[500] }} />
                  <Text style={{ fontSize: 7, lineHeight: 1, fontWeight: '500', color: slate[700], fontFamily: 'Inter' }}>critical</Text>
                  <Text style={{ fontSize: 7, lineHeight: 1, color: slate[500], fontFamily: 'Inter' }}>({t.critical})</Text>
                </View>
              )}
              {t.high > 0 && (
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.orange[500] }} />
                  <Text style={{ fontSize: 7, lineHeight: 1, fontWeight: '500', color: slate[700], fontFamily: 'Inter' }}>high</Text>
                  <Text style={{ fontSize: 7, lineHeight: 1, color: slate[500], fontFamily: 'Inter' }}>({t.high})</Text>
                </View>
              )}
              {t.medium > 0 && (
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.yellow[500] }} />
                  <Text style={{ fontSize: 7, lineHeight: 1, fontWeight: '500', color: slate[700], fontFamily: 'Inter' }}>medium</Text>
                  <Text style={{ fontSize: 7, lineHeight: 1, color: slate[500], fontFamily: 'Inter' }}>({t.medium})</Text>
                </View>
              )}
              {t.low > 0 && (
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.blue[500] }} />
                  <Text style={{ fontSize: 7, lineHeight: 1, fontWeight: '500', color: slate[700], fontFamily: 'Inter' }}>low</Text>
                  <Text style={{ fontSize: 7, lineHeight: 1, color: slate[500], fontFamily: 'Inter' }}>({t.low})</Text>
                </View>
              )}
            </View>
            <View style={{ height: 6, display: 'flex', flexDirection: 'row', borderRadius: 3, overflow: 'hidden', backgroundColor: slate[200] }}>
              {t.critical > 0 && <View style={{ height: '100%', width: `${(t.critical / t.total) * 100}%`, backgroundColor: palette.red[500] }} />}
              {t.high > 0 && <View style={{ height: '100%', width: `${(t.high / t.total) * 100}%`, backgroundColor: palette.orange[500] }} />}
              {t.medium > 0 && <View style={{ height: '100%', width: `${(t.medium / t.total) * 100}%`, backgroundColor: palette.yellow[500] }} />}
              {t.low > 0 && <View style={{ height: '100%', width: `${(t.low / t.total) * 100}%`, backgroundColor: palette.blue[500] }} />}
            </View>
          </View>
        ))}
      </View>
    )}
  </View>
);

// ============ Dynamic page packing ================================
//
// A4 content area ≈ 738 pt (842 − 56 top − 48 bottom).
// If the remaining space after a section would be < 10 % (~74 pt),
// the next section is pushed to a new page.

const PAGE_HEIGHT = 842;
const CONTENT_TOP = 56;
const CONTENT_BOTTOM = 48;
const USABLE_HEIGHT = PAGE_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM;

interface SectionEntry {
  estimatedHeight: number;
  render: () => React.ReactNode;
}

/** Build the ordered list of sections with estimated heights. */
function buildSections(data: ReportData): SectionEntry[] {
  const d = data.newDiscoveries;
  const discoveryTableCount =
    (d.domains.length > 0 ? 1 : 0) +
    (d.ipAddresses.length > 0 ? 1 : 0) +
    (d.ports.length > 0 ? 1 : 0) +
    (d.technologies.length > 0 ? 1 : 0);
  const discoveryRowCount =
    d.domains.length +
    d.ipAddresses.length +
    d.ports.length +
    d.technologies.length;

  return [
    // 01 – Executive Summary
    {
      estimatedHeight: 20 + 45, // sectionHeader + 1 metric row
      render: () => <ExecutiveSummary data={data} />,
    },
    // 02 – Severity Distribution
    {
      estimatedHeight: 20 + 50,
      render: () => <SeverityOverview data={data} />,
    },
    // 03 – Vulnerability Trend
    {
      estimatedHeight: 20 + 150,
      render: () => <VulnerabilityTrend data={data} />,
    },
    // 04 – Newly Discovered Assets
    {
      estimatedHeight:
        discoveryTableCount === 0
          ? 35
          : 20 + discoveryTableCount * 15 + discoveryRowCount * 14,
      render: () => <NewDiscoveries data={data} />,
    },
    // 05 – New Vulnerabilities Discovered
    {
      estimatedHeight:
        data.newFindings.length === 0
          ? 35
          : 20 + 12 + data.newFindings.length * 15,
      render: () => <NewFindings data={data} />,
    },
    // 06 – Vulnerability by Target
    {
      estimatedHeight:
        data.vulnerabilityByTarget.length === 0
          ? 35
          : 20 + data.vulnerabilityByTarget.length * 35,
      render: () => <VulnByTarget data={data} />,
    },
    // Report Info
    {
      estimatedHeight: 75,
      render: () => <ReportInfo />,
    },
  ];
}

/**
 * Pack sections into pages.  A new page is started when the next
 * section would leave less than MIN_REMAINING pt on the current page.
 */
function packIntoPages(sections: SectionEntry[]): SectionEntry[][] {
  const pages: SectionEntry[][] = [];
  let current: SectionEntry[] = [];
  let used = 0;

  for (const section of sections) {
    const wouldOverflow = used + section.estimatedHeight > USABLE_HEIGHT;
    const inDangerZone = used > USABLE_HEIGHT * 0.9;

    if (used > 0 && (wouldOverflow || inDangerZone)) {
      pages.push(current);
      current = [section];
      used = section.estimatedHeight;
    } else {
      current.push(section);
      used += section.estimatedHeight;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

// ============ Main Document ======================================

interface SummaryReportDocumentProps {
  data: ReportData;
}

export const SummaryReportDocument: React.FC<SummaryReportDocumentProps> = ({
  data,
}) => {
  const pages = packIntoPages(buildSections(data));

  return (
    <Document
      title={data.reportTitle}
      author="Open Attack Surface Management"
    >
      {/* Cover page — no header/footer */}
      <CoverPage
        coverTitle="Attack Surface Discovery Report"
        coverDescription="Comprehensive security analysis of your external attack surface, including vulnerability assessment, asset discovery, and risk evaluation."
        docRefPrefix="OASM-RPT"
        dateLabel="Date Exported"
        logoBase64={data.logoBase64}
        systemNameChar={data.systemNameChar}
        systemName={data.systemName}
        workspaceName={data.workspaceName}
        classification={data.classification}
        formattedDate={data.formattedDate}
      />

      {/* Dynamic content pages */}
      {pages.map((pageSections, i) => (
        <Page key={i} size="A4" style={styles.contentPage}>
          <ReportHeader logoBase64={data.logoBase64} reportTitle={data.reportTitle} />
          <ReportFooter
            systemName={data.systemName}
            classification={data.classification}
          />
          {pageSections.map((section, j) => (
            <View key={j}>{section.render()}</View>
          ))}
        </Page>
      ))}
    </Document>
  );
};
