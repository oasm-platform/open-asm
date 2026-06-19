import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { ReportData } from '../../types/report-data.type';
import { riskBadgeStyle, toUpper, statusLabel, statusBadgeStyle, severityBadgeStyle } from '../helpers';
import { slate } from '../theme';
import { CoverPage } from '../components/CoverPage';
import { ReportHeader } from '../components/ReportHeader';
import { ReportFooter } from '../components/ReportFooter';
import { ReportInfo } from '../components/ReportInfo';
import { SectionHeader } from '../components/SectionHeader';

// Ensure fonts are registered
import '../fonts';

const round2 = (v: number) => Number(v).toFixed(2);

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
  // Grid helpers (flex代替grid)
  row: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
  },
  col4: {
    flex: 1,
  },
  col6: {
    flex: 1,
  },
  col2: {
    flex: 1,
  },
  // Metric cards
  metricCard: {
    backgroundColor: slate[50],
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: slate[200],
    flex: 1,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: slate[500],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'Inter',
  },
  metricValueRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: slate[900],
    fontFamily: 'Inter',
  },
  metricChange: {
    fontSize: 7,
    fontFamily: 'Inter',
  },
  // Severity boxes
  sevBox: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    textAlign: 'center',
    flex: 1,
  },
  sevBoxLabel: {
    fontSize: 8,
    fontFamily: 'Inter',
    marginBottom: 2,
  },
  sevBoxValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter',
  },
  // Bar chart
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
    fontSize: 8,
    color: slate[400],
    fontFamily: 'Inter',
  },
  // Risk distribution
  riskDistRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  riskDistLabel: {
    fontSize: 8,
    width: 64,
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
    fontWeight: '500',
    color: slate[700],
    width: 32,
    textAlign: 'right',
    fontFamily: 'Inter',
  },
  // Tables
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
  th: {
    fontSize: 8,
    fontWeight: '600',
    color: slate[700],
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: 'Inter',
  },
  td: {
    fontSize: 8,
    paddingVertical: 6,
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
  tdRight: {
    textAlign: 'right',
  },
  // Badges
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
  // Info box
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
  // Section wrapper
  section: {
    marginBottom: 12,
  },
  panel: {
    padding: 12,
    borderWidth: 1,
    borderColor: slate[200],
    backgroundColor: slate[50],
  },
  panelTitle: {
    fontSize: 8,
    fontWeight: '600',
    color: slate[600],
    marginBottom: 8,
    fontFamily: 'Inter',
  },
  greenBadge: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontFamily: 'Inter',
    textAlign: 'center',
    fontWeight: '600',
    alignSelf: 'center',
  },
});

// ============ Section Components ============

const WeeklyMetrics: React.FC<{ data: ReportData }> = ({ data }) => {
  const w = data.weekly;
  return (
    <View style={styles.section}>
      <SectionHeader number="01" title="Weekly Performance Metrics" />
      {/* Top 4 metrics */}
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Targets</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{w.totalTargets}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{w.targetsChange} ({round2(w.targetsChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Assets</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{w.totalAssets}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{w.assetsChange} ({round2(w.assetsChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Services</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{w.totalServices}</Text>
            <Text style={[styles.metricChange, { color: '#dc2626' }]}>
              {w.servicesChange} ({round2(w.servicesChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Security Score</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{w.securityScore}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{w.scoreChange} ({round2(w.scoreChangePercent)}%)
            </Text>
          </View>
        </View>
      </View>
      {/* Severity row */}
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={[styles.sevBox, { backgroundColor: slate[50], borderColor: slate[200] }]}>
          <Text style={[styles.sevBoxLabel, { color: slate[500] }]}>Total Vulns</Text>
          <Text style={[styles.sevBoxValue, { color: slate[900] }]}>{w.activeVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#dc2626' }]}>Critical</Text>
          <Text style={[styles.sevBoxValue, { color: '#dc2626' }]}>{w.criticalVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#ea580c' }]}>High</Text>
          <Text style={[styles.sevBoxValue, { color: '#ea580c' }]}>{w.highVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fefce8', borderColor: '#fde68a' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#d97706' }]}>Medium</Text>
          <Text style={[styles.sevBoxValue, { color: '#d97706' }]}>{w.mediumVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#2563eb' }]}>Low</Text>
          <Text style={[styles.sevBoxValue, { color: '#2563eb' }]}>{w.lowVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: slate[50], borderColor: slate[200] }]}>
          <Text style={[styles.sevBoxLabel, { color: slate[500] }]}>Info</Text>
          <Text style={[styles.sevBoxValue, { color: slate[600] }]}>{w.infoVulns}</Text>
        </View>
      </View>
      <View style={styles.infoBox}>
        <Text>
          <Text style={{ fontWeight: '700' }}>{w.newVulns}</Text> new vulnerabilities
        </Text>
        <Text>
          <Text style={{ fontWeight: '700' }}>{w.resolvedVulns}</Text> resolved
        </Text>
      </View>
    </View>
  );
};

const MonthlyMetrics: React.FC<{ data: ReportData }> = ({ data }) => {
  const m = data.monthly;
  return (
    <View style={styles.section}>
      <SectionHeader number="02" title="Monthly Performance Summary" />
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Targets</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{m.totalTargets}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{m.targetsChange} ({round2(m.targetsChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Assets</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{m.totalAssets}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{m.assetsChange} ({round2(m.assetsChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Services</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{m.totalServices}</Text>
            <Text style={[styles.metricChange, { color: '#dc2626' }]}>
              {m.servicesChange} ({round2(m.servicesChangePercent)}%)
            </Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Security Score</Text>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{m.securityScore}</Text>
            <Text style={[styles.metricChange, { color: '#16a34a' }]}>
              +{m.scoreChange} ({round2(m.scoreChangePercent)}%)
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={[styles.sevBox, { backgroundColor: slate[50], borderColor: slate[200] }]}>
          <Text style={[styles.sevBoxLabel, { color: slate[500] }]}>Total Vulns</Text>
          <Text style={[styles.sevBoxValue, { color: slate[900] }]}>{m.activeVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#dc2626' }]}>Critical</Text>
          <Text style={[styles.sevBoxValue, { color: '#dc2626' }]}>{m.criticalVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#ea580c' }]}>High</Text>
          <Text style={[styles.sevBoxValue, { color: '#ea580c' }]}>{m.highVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#fefce8', borderColor: '#fde68a' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#d97706' }]}>Medium</Text>
          <Text style={[styles.sevBoxValue, { color: '#d97706' }]}>{m.mediumVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={[styles.sevBoxLabel, { color: '#2563eb' }]}>Low</Text>
          <Text style={[styles.sevBoxValue, { color: '#2563eb' }]}>{m.lowVulns}</Text>
        </View>
        <View style={[styles.sevBox, { backgroundColor: slate[50], borderColor: slate[200] }]}>
          <Text style={[styles.sevBoxLabel, { color: slate[500] }]}>Info</Text>
          <Text style={[styles.sevBoxValue, { color: slate[600] }]}>{m.infoVulns}</Text>
        </View>
      </View>
      <View style={styles.infoBox}>
        <Text>
          <Text style={{ fontWeight: '700' }}>{m.newVulns}</Text> new this month
        </Text>
        <Text>
          <Text style={{ fontWeight: '700' }}>{m.resolvedVulns}</Text> resolved this month
        </Text>
        <Text>
          <Text style={{ fontWeight: '700' }}>{m.scansCompleted}</Text> scans completed
        </Text>
      </View>
    </View>
  );
};

const VulnerabilityTrend: React.FC<{ data: ReportData }> = ({ data }) => {
  const trends = data.vulnerabilityTrends;
  return (
    <View style={styles.section}>
      <SectionHeader number="03" title="Vulnerability Trend (Last 30 Days)" />
      <View style={styles.row}>
        {/* Daily bar chart */}
        <View style={[styles.panel, { flex: 1 }]}>
          <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.panelTitle}>Daily Vulnerabilities</Text>
            <Text style={{ fontSize: 8, color: '#16a34a', fontFamily: 'Inter' }}>↓ Decreasing trend</Text>
          </View>
          <View style={styles.barRow}>
            {trends.last30Days.map((val, i) => {
              const heightPct = (val / 55) * 100;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: `${Math.max(heightPct, 4)}%`, minHeight: 4 },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.barLabel}>
            <Text>30 days ago</Text>
            <Text>Today</Text>
          </View>
        </View>
        {/* Risk distribution */}
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Risk Distribution</Text>
          {data.riskDistribution.map((item) => (
            <View key={item.level} style={styles.riskDistRow}>
              <Text style={styles.riskDistLabel}>{toUpper(item.level)}</Text>
              <View style={styles.riskDistBarBg}>
                <View
                  style={[styles.riskDistBar, { width: `${item.percent}%`, backgroundColor: item.color }]}
                />
              </View>
              <Text style={styles.riskDistCount}>{item.count}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 8, color: slate[500], marginTop: 8, fontFamily: 'Inter' }}>
            Avg: {trends.avgPerWeek} vulns/week
          </Text>
        </View>
      </View>
    </View>
  );
};

const NewDiscoveriesTable: React.FC<{
  title: string;
  headers: { label: string; width: string; align?: string }[];
  rows: unknown[];
  renderCell: (key: string, item: unknown) => React.ReactNode;
}> = ({ title, headers, rows, renderCell }) => {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 8, fontWeight: '600', color: slate[600], marginBottom: 4, fontFamily: 'Inter' }}>
        {title}
      </Text>
      <View>
        <View style={styles.tableHeader}>
          {headers.map((h) => (
            <Text
              key={h.label}
              style={{ ...styles.th, width: h.width, ...(h.align === 'center' ? styles.tdCenter : {}) }}
            >
              {h.label}
            </Text>
          ))}
        </View>
        {rows.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            {headers.map((h) => (
              <View
                key={h.label}
                style={{ ...styles.td, width: h.width, ...(h.align === 'center' ? { ...styles.tdCenter, ...styles.badgeCell } : {}) }}
              >
                {typeof renderCell(h.label, item) === 'string'
                  ? <Text>{renderCell(h.label, item) as string}</Text>
                  : renderCell(h.label, item)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const NewDiscoveries: React.FC<{ data: ReportData }> = ({ data }) => {
  const d = data.newDiscoveries;
  return (
    <View style={styles.section}>
      <SectionHeader number="04" title="Newly Discovered Assets" />
      <NewDiscoveriesTable
        title="New Domains"
        headers={[
          { label: 'Domain', width: '35%' },
          { label: 'Discovered', width: '20%', align: 'center' },
          { label: 'Provider', width: '20%', align: 'center' },
          { label: 'Risk', width: '25%', align: 'center' },
        ]}
        rows={d.domains}
        renderCell={(key, item) => {
          const domain = item as { identifier: string; discovered: string; provider: string; riskLevel: string };
          if (key === 'Domain') return domain.identifier;
          if (key === 'Discovered') return domain.discovered;
          if (key === 'Provider') return domain.provider;
          if (key === 'Risk') {
            const s = riskBadgeStyle(domain.riskLevel);
            return (
              <Text style={[styles.badge, { backgroundColor: s.backgroundColor, color: s.color, borderWidth: 0 }]}>
                {toUpper(domain.riskLevel)}
              </Text>
            );
          }
          return '';
        }}
      />
      <NewDiscoveriesTable
        title="New IP Addresses"
        headers={[
          { label: 'IP Address', width: '35%' },
          { label: 'Discovered', width: '20%', align: 'center' },
          { label: 'Provider', width: '20%', align: 'center' },
          { label: 'Risk', width: '25%', align: 'center' },
        ]}
        rows={d.ipAddresses}
        renderCell={(key, item) => {
          const ip = item as { identifier: string; discovered: string; provider: string; riskLevel: string };
          if (key === 'IP Address') return ip.identifier;
          if (key === 'Discovered') return ip.discovered;
          if (key === 'Provider') return ip.provider;
          if (key === 'Risk') {
            const s = riskBadgeStyle(ip.riskLevel);
            return (
              <Text style={[styles.badge, { backgroundColor: s.backgroundColor, color: s.color, borderWidth: 0 }]}>
                {toUpper(ip.riskLevel)}
              </Text>
            );
          }
          return '';
        }}
      />
      <NewDiscoveriesTable
        title="New Open Ports"
        headers={[
          { label: 'Port', width: '15%' },
          { label: 'Service', width: '20%' },
          { label: 'Discovered', width: '20%', align: 'center' },
          { label: 'Target', width: '25%' },
          { label: 'Risk', width: '20%', align: 'center' },
        ]}
        rows={d.ports}
        renderCell={(key, item) => {
          const p = item as { port: number; service: string; discovered: string; target: string; riskLevel: string };
          if (key === 'Port') return String(p.port);
          if (key === 'Service') return p.service;
          if (key === 'Discovered') return p.discovered;
          if (key === 'Target') return p.target;
          if (key === 'Risk') {
            const s = riskBadgeStyle(p.riskLevel);
            return (
              <Text style={[styles.badge, { backgroundColor: s.backgroundColor, color: s.color, borderWidth: 0 }]}>
                {toUpper(p.riskLevel)}
              </Text>
            );
          }
          return '';
        }}
      />
      <NewDiscoveriesTable
        title="New Technologies Detected"
        headers={[
          { label: 'Technology', width: '30%' },
          { label: 'Category', width: '20%', align: 'center' },
          { label: 'Discovered', width: '20%', align: 'center' },
          { label: 'Target', width: '30%' },
        ]}
        rows={d.technologies}
        renderCell={(key, item) => {
          const t = item as { name: string; category: string; discovered: string; target: string };
          if (key === 'Technology') return t.name;
          if (key === 'Category') return t.category;
          if (key === 'Discovered') return t.discovered;
          if (key === 'Target') return t.target;
          return '';
        }}
      />
    </View>
  );
};

const NewFindings: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="05" title="New Vulnerabilities Discovered" />
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: '35%' }]}>Vulnerability</Text>
        <Text style={[styles.th, { width: '15%', textAlign: 'center' as const }]}>Severity</Text>
        <Text style={[styles.th, { width: '15%', textAlign: 'center' as const }]}>CVSS</Text>
        <Text style={[styles.th, { width: '35%' }]}>Affected Asset</Text>
      </View>
      {data.newFindings.map((f, i) => {
        const sev = severityBadgeStyle(f.severity);
        return (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.td, { width: '35%' }]}>{f.title}</Text>
            <View style={[styles.td, styles.badgeCell, { width: '15%' }]}>
              <Text
                style={[
                  styles.badge,
                  {
                    backgroundColor: sev.backgroundColor,
                    color: sev.color,
                    borderColor: sev.borderColor,
                  },
                ]}
              >
                {toUpper(f.severity)}
              </Text>
            </View>
            <Text style={[styles.td, styles.tdMono, { width: '15%', textAlign: 'center' }]}>{f.cvss}</Text>
            <Text style={[styles.td, styles.tdMono, { width: '35%' }]}>{f.asset}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const RecentlyResolved: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="06" title="Recently Resolved" />
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: '20%' }]}>CVE / ID</Text>
        <Text style={[styles.th, { width: '45%' }]}>Vulnerability</Text>
        <Text style={[styles.th, { width: '18%', textAlign: 'center' as const }]}>Resolved</Text>
        <Text style={[styles.th, { width: '17%', textAlign: 'center' as const }]}>Days Open</Text>
      </View>
      {data.resolvedFindings.map((f, i) => (
        <View key={i} style={styles.tableRow}>
          <Text style={[styles.td, styles.tdMono, { width: '20%' }]}>{f.id}</Text>
          <Text style={[styles.td, { width: '45%' }]}>{f.title}</Text>
          <Text style={[styles.td, { width: '18%', textAlign: 'center' }]}>{f.resolved}</Text>
          <View style={[styles.td, styles.badgeCell, { width: '17%' }]}>
            <Text style={styles.greenBadge}>{f.daysOpen}d</Text>
          </View>
        </View>
      ))}
    </View>
  </View>
);

const VulnByTarget: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={styles.section}>
    <SectionHeader number="07" title="Vulnerability by Target" />
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: '25%' }]}>Target</Text>
        <Text style={[styles.th, { width: '12%', textAlign: 'center' as const }]}>Type</Text>
        <Text style={[styles.th, { width: '12%', textAlign: 'center' as const, color: '#dc2626' }]}>Critical</Text>
        <Text style={[styles.th, { width: '12%', textAlign: 'center' as const, color: '#ea580c' }]}>High</Text>
        <Text style={[styles.th, { width: '12%', textAlign: 'center' as const, color: '#d97706' }]}>Medium</Text>
        <Text style={[styles.th, { width: '12%', textAlign: 'center' as const, color: '#2563eb' }]}>Low</Text>
        <Text style={[styles.th, { width: '15%', textAlign: 'center' as const }]}>Total</Text>
      </View>
      {data.vulnerabilityByTarget.map((t, i) => (
        <View key={i} style={styles.tableRow}>
          <Text style={[styles.td, { width: '25%', fontFamily: 'JetBrains Mono', fontWeight: '500' }]}>{t.target}</Text>
          <Text style={[styles.td, { width: '12%', textAlign: 'center' }]}>{t.type}</Text>
          <Text style={[styles.td, styles.tdMono, { width: '12%', textAlign: 'center', color: '#dc2626' }]}>{t.critical}</Text>
          <Text style={[styles.td, styles.tdMono, { width: '12%', textAlign: 'center', color: '#ea580c' }]}>{t.high}</Text>
          <Text style={[styles.td, styles.tdMono, { width: '12%', textAlign: 'center', color: '#d97706' }]}>{t.medium}</Text>
          <Text style={[styles.td, styles.tdMono, { width: '12%', textAlign: 'center', color: '#2563eb' }]}>{t.low}</Text>
          <Text style={[styles.td, { width: '15%', textAlign: 'center', fontWeight: '700' }]}>{t.total}</Text>
        </View>
      ))}
    </View>
  </View>
);

const TargetInventory: React.FC<{ data: ReportData }> = ({ data }) => (
  <View style={{ marginBottom: 8 }}>
    <SectionHeader number="08" title="Detailed Target Inventory" />
    <View>
      <View style={[styles.tableHeader, { borderBottomWidth: 2 }]}>
        <Text style={[styles.th, { width: '30%' }]}>Target Identifier</Text>
        <Text style={[styles.th, { width: '15%', textAlign: 'center' as const }]}>Status</Text>
        <Text style={[styles.th, { width: '15%', textAlign: 'center' as const }]}>Risk</Text>
        <Text style={[styles.th, { width: '20%', textAlign: 'center' as const }]}>Provider</Text>
        <Text style={[styles.th, { width: '20%', textAlign: 'right' as const }]}>Last Scan</Text>
      </View>
      {data.targets.map((t, i) => {
        const stat = statusBadgeStyle(t.status);
        const risk = riskBadgeStyle(t.riskLevel);
        return (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.td, styles.tdMono, { width: '30%' }]}>{t.identifier}</Text>
            <View style={[styles.td, styles.badgeCell, { width: '15%' }]}>
              <Text
                style={[
                  styles.badge,
                  {
                    backgroundColor: stat.backgroundColor,
                    color: stat.color,
                    borderColor: stat.borderColor,
                  },
                ]}
              >
                {statusLabel(t.status)}
              </Text>
            </View>
            <View style={[styles.td, styles.badgeCell, { width: '15%' }]}>
              <Text
                style={[
                  styles.badge,
                  {
                    backgroundColor: risk.backgroundColor,
                    color: risk.color,
                  },
                ]}
              >
                {toUpper(t.riskLevel)}
              </Text>
            </View>
            <Text style={[styles.td, { width: '20%', textAlign: 'center' }]}>{t.provider}</Text>
            <Text style={[styles.td, { width: '20%', textAlign: 'right' }]}>{t.lastScan}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

// ============ Main Document ============

interface SummaryReportDocumentProps {
  data: ReportData;
}

export const SummaryReportDocument: React.FC<SummaryReportDocumentProps> = ({ data }) => (
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
      classification={data.classification}
      formattedDate={data.formattedDate}
    />

    {/* Content pages with header/footer */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader logoBase64={data.logoBase64} />
      <ReportFooter systemName={data.systemName} classification={data.classification} />

      <WeeklyMetrics data={data} />
      <MonthlyMetrics data={data} />
      <VulnerabilityTrend data={data} />
      <NewDiscoveries data={data} />
      <NewFindings data={data} />
      <RecentlyResolved data={data} />
      <VulnByTarget data={data} />
      <TargetInventory data={data} />

      <ReportInfo />
    </Page>
  </Document>
);
