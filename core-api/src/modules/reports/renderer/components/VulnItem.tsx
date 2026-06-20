import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';
import { join, formatDate, severityImpact } from '../helpers';
import { SeverityBadge } from './Badge';

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    fontFamily: 'Inter',
  },
  // Header
  header: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Inter',
    alignSelf: 'flex-start',
  },
  headerContent: {
    flex: 1,
  },
  vulnName: {
    fontSize: 10,
    fontWeight: '700',
    color: slate[900],
    lineHeight: 1.3,
    fontFamily: 'Inter',
  },
  scoresRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    fontSize: 8,
    color: slate[500],
    fontFamily: 'Inter',
  },
  scoreSep: {
    color: slate[300],
  },
  // Section headers
  sectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: slate[700],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: slate[200],
    fontFamily: 'Inter',
  },
  // Details grid
  detailsGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 12,
  },
  detailItem: {
    width: '50%',
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  detailItemFull: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  detailLabel: {
    color: slate[500],
    fontFamily: 'Inter',
    fontSize: 8,
  },
  detailValue: {
    fontWeight: '600',
    color: slate[800],
    fontFamily: 'Inter',
    fontSize: 8,
  },
  monoValue: {
    fontFamily: 'JetBrains Mono',
    fontWeight: '600',
    color: slate[800],
    fontSize: 8,
  },
  // Identifier badges (plain text, no background)
  idBadges: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  idBadge: {
    fontSize: 7,
    fontFamily: 'JetBrains Mono',
    fontWeight: '600',
  },
  // Description
  description: {
    fontSize: 8,
    color: slate[700],
    lineHeight: 1.6,
    marginBottom: 12,
    fontFamily: 'Inter',
  },
  // Impact
  impactText: {
    fontSize: 8,
    color: slate[700],
    lineHeight: 1.6,
    fontFamily: 'Inter',
  },
  impactLevel: {
    fontWeight: '700',
    marginBottom: 4,
  },
  // Exploitation
  exploitText: {
    fontSize: 8,
    color: slate[700],
    lineHeight: 1.6,
    fontFamily: 'Inter',
  },
  // Remediation
  remediationBox: {
    padding: 8,
    borderWidth: 1,
    borderColor: slate[200],
    backgroundColor: slate[50],
  },
  remediationText: {
    fontSize: 8,
    color: slate[700],
    lineHeight: 1.6,
    fontFamily: 'Inter',
  },
  // References
  refItem: {
    fontSize: 7,
    color: slate[600],
    fontFamily: 'JetBrains Mono',
    marginBottom: 2,
  },
  // Steps
  stepsList: {
    paddingLeft: 16,
    fontSize: 8,
    color: slate[700],
    lineHeight: 1.6,
    fontFamily: 'Inter',
  },
  stepItem: {
    marginBottom: 2,
  },
  stepTarget: {
    fontFamily: 'JetBrains Mono',
    fontWeight: '600',
  },
  stepTool: {
    fontWeight: '700',
  },
  // Timeline
  timeline: {
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    fontSize: 7,
    color: slate[400],
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: slate[100],
    fontFamily: 'Inter',
    marginTop: 8,
  },
  timelineValue: {
    color: slate[600],
    fontWeight: '500',
  },
  // Section wrapper
  section: {
    marginBottom: 12,
  },
});

interface VulnItemProps {
  severity: string;
  name: string;
  cvssScore: number;
  cvssMetric?: string;
  epssScore?: number | null;
  vprScore?: number | null;
  asset: string;
  tool: string;
  ipAddress?: string;
  host?: string;
  affectedUrl?: string;
  ports?: string[];
  cveId?: string[];
  cweId?: string[];
  bidId?: string[];
  description?: string;
  analyzeResult?: string;
  solution?: string;
  references?: string[];
  createdAt?: string;
  firstDetectedDate?: string | null;
  lastSeenDate?: string | null;
  publicationDate?: string | null;
}

export const VulnItem: React.FC<VulnItemProps> = ({
  severity,
  name,
  cvssScore,
  cvssMetric,
  epssScore,
  vprScore,
  asset,
  tool,
  ipAddress,
  host,
  affectedUrl,
  ports,
  cveId,
  cweId,
  bidId,
  description,
  analyzeResult,
  solution,
  references,
  createdAt,
  firstDetectedDate,
  lastSeenDate,
  publicationDate,
}) => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <SeverityBadge severity={severity} />
        <View style={styles.headerContent}>
          <Text style={styles.vulnName}>{name}</Text>
          <View style={styles.scoresRow}>
            <Text style={{ fontWeight: '600' }}>CVSS {cvssScore}</Text>
            {cvssMetric && (
              <>
                <Text style={styles.scoreSep}>|</Text>
                <Text>{cvssMetric}</Text>
              </>
            )}
            {epssScore !== null && epssScore !== undefined && (
              <>
                <Text style={styles.scoreSep}>|</Text>
                <Text>EPSS {epssScore}%</Text>
              </>
            )}
            {vprScore !== null && vprScore !== undefined && (
              <>
                <Text style={styles.scoreSep}>|</Text>
                <Text>VPR {vprScore}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Vulnerability Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vulnerability Details</Text>
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Asset:</Text>
            <Text style={styles.detailValue}>{asset}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Tool:</Text>
            <Text style={styles.detailValue}>{tool}</Text>
          </View>
          {ipAddress && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>IP Address:</Text>
              <Text style={styles.monoValue}>{ipAddress}</Text>
            </View>
          )}
          {host && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Host:</Text>
              <Text style={styles.monoValue}>{host}</Text>
            </View>
          )}
          {affectedUrl && (
            <View style={styles.detailItemFull}>
              <Text style={styles.detailLabel}>URL:</Text>
              <Text style={styles.monoValue}>{affectedUrl}</Text>
            </View>
          )}
          {ports && ports.length > 0 && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Ports:</Text>
              <Text style={styles.monoValue}>{join(ports, ', ')}</Text>
            </View>
          )}
        </View>

        {/* Identifiers */}
        {cveId && cveId.length > 0 && (
          <View style={styles.idBadges}>
            {cveId.map((id) => (
              <Text
                key={`cve-${id}`}
                style={[styles.idBadge, { color: slate[700] }]}
              >
                CVE-{id}
              </Text>
            ))}
            {cweId &&
              cweId.map((id) => (
                <Text
                  key={`cwe-${id}`}
                  style={[styles.idBadge, { color: slate[700] }]}
                >
                  CWE-{id}
                </Text>
              ))}
            {bidId &&
              bidId.map((id) => (
                <Text
                  key={`bid-${id}`}
                  style={[styles.idBadge, { color: slate[700] }]}
                >
                  BID-{id}
                </Text>
              ))}
          </View>
        )}
      </View>

      {/* Description */}
      {description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      )}

      {/* Impact and Severity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Impact and Severity</Text>
        <Text style={styles.impactText}>
          <Text style={styles.impactLevel}>Severity Level:</Text> {severity} (CVSS{' '}
          {cvssScore}/10)
        </Text>
        <Text style={styles.impactText}>{severityImpact(severity)}</Text>
      </View>

      {/* Exploitation */}
      {analyzeResult && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exploitation</Text>
          <Text style={styles.exploitText}>{analyzeResult}</Text>
        </View>
      )}

      {/* Remediation */}
      {solution && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remediation</Text>
          <View style={styles.remediationBox}>
            <Text style={styles.remediationText}>{solution}</Text>
          </View>
        </View>
      )}

      {/* Steps to Produce */}
      {affectedUrl && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Steps to Produce</Text>
          <View style={styles.stepsList}>
            <Text style={styles.stepItem}>
              1. Identify the target:{' '}
              <Text style={styles.stepTarget}>
                {ipAddress}
                {host ? ` (${host})` : ''}
              </Text>
            </Text>
            {affectedUrl && (
              <Text style={styles.stepItem}>
                2. Navigate to: <Text style={styles.monoValue}>{affectedUrl}</Text>
              </Text>
            )}
            {ports && ports.length > 0 && (
              <Text style={styles.stepItem}>
                3. Ensure ports are accessible:{' '}
                <Text style={styles.monoValue}>{join(ports, ', ')}</Text>
              </Text>
            )}
            <Text style={styles.stepItem}>
              {ports && ports.length > 0 ? 4 : 3}. Utilize{' '}
              <Text style={styles.stepTool}>{tool}</Text> to perform vulnerability
              assessment.
            </Text>
            <Text style={styles.stepItem}>
              {ports && ports.length > 0 ? 5 : 4}. Verify the vulnerability by
              checking for <Text style={styles.stepTool}>{name}</Text> indicators.
            </Text>
          </View>
        </View>
      )}

      {/* References */}
      {references && references.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>References</Text>
          {references.map((ref) => (
            <Text key={ref} style={styles.refItem}>
              {ref}
            </Text>
          ))}
        </View>
      )}

      {/* Timeline */}
      <View style={styles.timeline}>
        <Text>
          Discovered:{' '}
          <Text style={styles.timelineValue}>{formatDate(createdAt)}</Text>
        </Text>
        {firstDetectedDate && (
          <Text>
            First Seen:{' '}
            <Text style={styles.timelineValue}>
              {formatDate(firstDetectedDate)}
            </Text>
          </Text>
        )}
        {lastSeenDate && (
          <Text>
            Last Seen:{' '}
            <Text style={styles.timelineValue}>{formatDate(lastSeenDate)}</Text>
          </Text>
        )}
        {publicationDate && (
          <Text>
            Published:{' '}
            <Text style={styles.timelineValue}>
              {formatDate(publicationDate)}
            </Text>
          </Text>
        )}
      </View>
    </View>
  );
};
