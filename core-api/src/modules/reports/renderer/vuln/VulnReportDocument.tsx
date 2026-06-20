import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { VulnerabilityReportData } from '../../types/vulnerability-report-data.type';
import { slate, severityStyles } from '../theme';
import { CoverPage } from '../components/CoverPage';
import { ReportHeader } from '../components/ReportHeader';
import { ReportFooter } from '../components/ReportFooter';
import { ReportInfo } from '../components/ReportInfo';
import { SectionHeader } from '../components/SectionHeader';
import { MetricCard } from '../components/MetricCard';
import { SeverityDistribution } from '../components/SeverityDistribution';
import { VulnItem } from '../components/VulnItem';
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
    gap: 12,
    marginBottom: 12,
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    borderBottomWidth: 2,
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
    color: slate[600],
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontFamily: 'Inter',
  },
  td: {
    fontSize: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontFamily: 'Inter',
    color: slate[800],
  },
  panel: {
    padding: 8,
    borderWidth: 1,
    borderColor: slate[200],
  },
  panelTitle: {
    fontSize: 8,
    fontWeight: '600',
    color: slate[700],
    marginBottom: 8,
    fontFamily: 'Inter',
  },
  statCard: {
    padding: 8,
    borderWidth: 1,
    borderColor: slate[200],
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '500',
    color: slate[500],
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Inter',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: slate[900],
    fontFamily: 'Inter',
  },
  textSlate300: { color: slate[300] },
  textSlate900: { color: slate[900] },
  section: {
    marginBottom: 24,
  },
  noData: {
    fontSize: 9,
    color: slate[500],
    textAlign: 'center',
    paddingVertical: 32,
  },
});

// ============ Section Components ============

const ExecutiveSummary: React.FC<{ data: VulnerabilityReportData }> = ({
  data,
}) => {
  const s = data.summary;
  return (
    <View style={styles.section}>
      <SectionHeader number="01" title="Executive Summary" />
      <View style={[styles.row, { marginBottom: 8 }]}>
        <MetricCard
          label="Vulnerabilities"
          value={s.totalVulnerabilities}
          subtext={`Active: ${s.activeCount}`}
        />
        <MetricCard
          label="Avg CVSS Score"
          value={s.avgCvssScore}
          subtext="/ 10"
        />
        <MetricCard
          label="Critical Findings"
          value={s.criticalCount}
          subtext="Immediate action"
          critical
        />
        <MetricCard
          label="Dismissed"
          value={s.dismissedCount}
          subtext="Review pending"
        />
      </View>
      <SeverityDistribution severityDistribution={data.severityDistribution} />
    </View>
  );
};

const TopAssets: React.FC<{ data: VulnerabilityReportData }> = ({ data }) => {
  const getValColor = (level: string, val: number) => {
    if (!val) return styles.textSlate300;
    const key = level.toLowerCase() as keyof typeof severityStyles;
    const style = severityStyles[key] || severityStyles.low;
    return { color: style.text };
  };

  return (
    <View style={styles.section}>
      <SectionHeader number="02" title="Top Assets by Vulnerabilities" />
      {data.topAssets.length === 0 ? (
        <Text style={styles.noData}>No data</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: '30%' }]}>Asset</Text>
            <Text
              style={[
                styles.th,
                { width: '14%', textAlign: 'center' as const },
              ]}
            >
              Critical
            </Text>
            <Text
              style={[
                styles.th,
                { width: '14%', textAlign: 'center' as const },
              ]}
            >
              High
            </Text>
            <Text
              style={[
                styles.th,
                { width: '14%', textAlign: 'center' as const },
              ]}
            >
              Medium
            </Text>
            <Text
              style={[
                styles.th,
                { width: '14%', textAlign: 'center' as const },
              ]}
            >
              Low
            </Text>
            <Text
              style={[
                styles.th,
                { width: '14%', textAlign: 'center' as const },
              ]}
            >
              Total
            </Text>
          </View>
          {data.topAssets.map((a, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.td, { width: '30%', fontWeight: '500' }]}>
                {a.asset}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '14%',
                    textAlign: 'center',
                    ...getValColor('critical', a.critical),
                    fontWeight: '600',
                  },
                ]}
              >
                {a.critical || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '14%',
                    textAlign: 'center',
                    ...getValColor('high', a.high),
                    fontWeight: '600',
                  },
                ]}
              >
                {a.high || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '14%',
                    textAlign: 'center',
                    ...getValColor('medium', a.medium),
                    fontWeight: '600',
                  },
                ]}
              >
                {a.medium || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '14%',
                    textAlign: 'center',
                    ...getValColor('low', a.low),
                    fontWeight: '600',
                  },
                ]}
              >
                {a.low || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '14%',
                    textAlign: 'center',
                    fontWeight: '700',
                    color: slate[900],
                  },
                ]}
              >
                {a.total}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const VulnTrends: React.FC<{ data: VulnerabilityReportData }> = ({ data }) => {
  const t = data.vulnerabilityTrends;
  return (
    <View style={styles.section}>
      <SectionHeader number="03" title="Vulnerability Trends" />
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Last 7 Days</Text>
          <BarChart data={t.last7Days} showLabels labelStart="0" labelEnd="6" />
        </View>
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Last 30 Days</Text>
          <BarChart data={t.last30Days} showLabels />
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.statCard, { flex: 1 }]}>
          <Text style={styles.statLabel}>Avg per Week</Text>
          <Text style={styles.statValue}>{t.avgPerWeek}</Text>
        </View>
        <View style={[styles.statCard, { flex: 1 }]}>
          <Text style={styles.statLabel}>Trend</Text>
          <Text style={[styles.statValue, { textTransform: 'capitalize' }]}>
            {t.trend}
          </Text>
        </View>
        <View style={[styles.statCard, { flex: 1 }]}>
          <Text style={styles.statLabel}>Analyzed</Text>
          <Text style={styles.statValue}>{data.analyzeStats.done}</Text>
        </View>
      </View>
    </View>
  );
};

const TargetAnalysis: React.FC<{ data: VulnerabilityReportData }> = ({
  data,
}) => {
  const getValColor = (level: string, val: number) => {
    if (!val) return styles.textSlate300;
    const key = level.toLowerCase() as keyof typeof severityStyles;
    const style = severityStyles[key] || severityStyles.low;
    return { color: style.text };
  };

  return (
    <View style={styles.section}>
      <SectionHeader number="04" title="Target Vulnerability Analysis" />
      {data.targetStats.length === 0 ? (
        <Text style={styles.noData}>No data</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: '25%' }]}>Target</Text>
            <Text style={[styles.th, { width: '15%' }]}>Type</Text>
            <Text
              style={[
                styles.th,
                { width: '12%', textAlign: 'center' as const },
              ]}
            >
              Critical
            </Text>
            <Text
              style={[
                styles.th,
                { width: '12%', textAlign: 'center' as const },
              ]}
            >
              High
            </Text>
            <Text
              style={[
                styles.th,
                { width: '12%', textAlign: 'center' as const },
              ]}
            >
              Medium
            </Text>
            <Text
              style={[
                styles.th,
                { width: '12%', textAlign: 'center' as const },
              ]}
            >
              Low
            </Text>
            <Text
              style={[
                styles.th,
                { width: '12%', textAlign: 'center' as const },
              ]}
            >
              Total
            </Text>
          </View>
          {data.targetStats.map((t, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.td, { width: '25%', fontWeight: '500' }]}>
                {t.target}
              </Text>
              <Text style={[styles.td, { width: '15%' }]}>{t.type}</Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '12%',
                    textAlign: 'center',
                    ...getValColor('critical', t.critical),
                    fontWeight: '600',
                  },
                ]}
              >
                {t.critical || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '12%',
                    textAlign: 'center',
                    ...getValColor('high', t.high),
                    fontWeight: '600',
                  },
                ]}
              >
                {t.high || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '12%',
                    textAlign: 'center',
                    ...getValColor('medium', t.medium),
                    fontWeight: '600',
                  },
                ]}
              >
                {t.medium || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '12%',
                    textAlign: 'center',
                    ...getValColor('low', t.low),
                    fontWeight: '600',
                  },
                ]}
              >
                {t.low || '-'}
              </Text>
              <Text
                style={[
                  styles.td,
                  {
                    width: '12%',
                    textAlign: 'center',
                    fontWeight: '700',
                    color: slate[900],
                  },
                ]}
              >
                {t.total}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ============ Main Document ======================================

interface VulnReportDocumentProps {
  data: VulnerabilityReportData;
}

export const VulnReportDocument: React.FC<VulnReportDocumentProps> = ({
  data,
}) => (
  <Document title={data.reportTitle} author="Open Attack Surface Management">
    {/* Cover page — no header/footer */}
    <CoverPage
      coverTitle="Vulnerability Assessment Report"
      coverDescription="Comprehensive vulnerability analysis of your attack surface, including severity distribution, critical findings, and remediation recommendations."
      docRefPrefix="OASM-VUL"
      logoBase64={data.logoBase64}
      systemNameChar={data.systemNameChar}
      systemName={data.systemName}
      workspaceName={data.workspaceName}
      classification={data.classification}
      formattedDate={data.formattedDate}
    />

    {/* Section 01: Executive Summary */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader
        logoBase64={data.logoBase64}
        reportTitle={data.reportTitle}
      />
      <ReportFooter
        systemName={data.systemName}
        classification={data.classification}
      />
      <ExecutiveSummary data={data} />
    </Page>

    {/* Section 02: Top Assets */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader
        logoBase64={data.logoBase64}
        reportTitle={data.reportTitle}
      />
      <ReportFooter
        systemName={data.systemName}
        classification={data.classification}
      />
      <TopAssets data={data} />
    </Page>

    {/* Section 03: Vulnerability Trends */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader
        logoBase64={data.logoBase64}
        reportTitle={data.reportTitle}
      />
      <ReportFooter
        systemName={data.systemName}
        classification={data.classification}
      />
      <VulnTrends data={data} />
    </Page>

    {/* Section 04: Target Analysis */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader
        logoBase64={data.logoBase64}
        reportTitle={data.reportTitle}
      />
      <ReportFooter
        systemName={data.systemName}
        classification={data.classification}
      />
      <TargetAnalysis data={data} />
    </Page>

    {/* Each vulnerability gets its own fresh page */}
    {data.allVulnerabilities.map((vuln, i) => (
      <Page key={vuln.id} size="A4" style={styles.contentPage}>
        <ReportHeader
          logoBase64={data.logoBase64}
          reportTitle={data.reportTitle}
        />
        <ReportFooter
          systemName={data.systemName}
          classification={data.classification}
        />
        {i === 0 && <SectionHeader number="05" title="All Vulnerabilities" />}
        <VulnItem
          severity={vuln.severity}
          name={vuln.name}
          cvssScore={vuln.cvssScore}
          cvssMetric={vuln.cvssMetric}
          epssScore={vuln.epssScore}
          vprScore={vuln.vprScore}
          asset={vuln.asset}
          tool={vuln.tool}
          ipAddress={vuln.ipAddress}
          host={vuln.host}
          affectedUrl={vuln.affectedUrl}
          ports={vuln.ports}
          cveId={vuln.cveId}
          cweId={vuln.cweId}
          bidId={vuln.bidId}
          description={vuln.description}
          solution={vuln.solution}
          references={vuln.references}
          createdAt={vuln.createdAt}
          firstDetectedDate={vuln.firstDetectedDate}
          lastSeenDate={vuln.lastSeenDate}
          publicationDate={vuln.publicationDate}
        />
      </Page>
    ))}

    {data.allVulnerabilities.length === 0 && (
      <Page size="A4" style={styles.contentPage}>
        <ReportHeader
          logoBase64={data.logoBase64}
          reportTitle={data.reportTitle}
        />
        <ReportFooter
          systemName={data.systemName}
          classification={data.classification}
        />
        <SectionHeader number="05" title="All Vulnerabilities" />
        <Text style={styles.noData}>No vulnerabilities found</Text>
      </Page>
    )}

    {/* Report info on final page */}
    <Page size="A4" style={styles.contentPage}>
      <ReportHeader
        logoBase64={data.logoBase64}
        reportTitle={data.reportTitle}
      />
      <ReportFooter
        systemName={data.systemName}
        classification={data.classification}
      />
      <ReportInfo />
    </Page>
  </Document>
);
