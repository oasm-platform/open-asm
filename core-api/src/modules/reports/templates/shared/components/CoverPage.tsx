import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  page: {
    width: '100%',
    height: '100%',
    position: 'relative',
    fontFamily: 'Inter',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 56,
    paddingTop: 32,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  logoFallback: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: slate[900],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
  systemName: {
    fontSize: 9,
    fontWeight: '600',
    color: slate[700],
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontFamily: 'Inter',
  },
  centerContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 56,
  },
  subtitle: {
    fontSize: 8,
    color: slate[500],
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontWeight: '500',
    marginBottom: 6,
    fontFamily: 'Inter',
  },
  divider: {
    width: 64,
    height: 2,
    backgroundColor: slate[800],
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: slate[900],
    lineHeight: 1.2,
    letterSpacing: -0.5,
    marginBottom: 14,
    fontFamily: 'Inter',
  },
  description: {
    fontSize: 10,
    color: slate[500],
    maxWidth: 400,
    lineHeight: 1.6,
    fontFamily: 'Inter',
  },
  metaGrid: {
    display: 'flex',
    flexDirection: 'row',
    gap: 48,
    marginTop: 48,
  },
  metaLabel: {
    fontSize: 8,
    color: slate[400],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
    fontFamily: 'Inter',
  },
  metaValue: {
    fontSize: 9,
    fontWeight: '500',
    fontFamily: 'Inter',
  },
  metaRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 48,
    marginTop: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: slate[200],
    paddingHorizontal: 56,
    paddingVertical: 24,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyright: {
    fontSize: 8,
    color: slate[400],
    fontFamily: 'Inter',
  },
  classification: {
    fontSize: 8,
    color: '#dc2626',
    fontFamily: 'Inter',
  },
});

interface CoverPageProps {
  coverTitle: string;
  coverDescription: string;
  docRefPrefix: string;
  dateLabel?: string;
  logoBase64?: string;
  systemNameChar?: string;
  systemName?: string;
  workspaceName?: string;
  classification?: string;
  formattedDate?: string;
}

export const CoverPage: React.FC<CoverPageProps> = ({
  coverTitle,
  coverDescription,
  dateLabel,
  logoBase64,
  systemNameChar,
  systemName,
  workspaceName,
  classification,
  formattedDate,
}) => {
  const cls = classification || 'Strictly Confidential';
  const dateLbl = dateLabel || 'Date Generated';

  return (
    <Page size="A4" style={styles.page}>
      {/* Top bar */}
      <View style={styles.topBar}>
        {logoBase64 ? (
          <Image src={logoBase64} style={styles.logo} />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoFallbackText}>{systemNameChar || 'O'}</Text>
          </View>
        )}
        <Text style={styles.systemName}>{systemName}</Text>
      </View>

      {/* Center content */}
      <View style={styles.centerContent}>
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.subtitle}>Security Assessment Report</Text>
          <View style={styles.divider} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.title}>{coverTitle}</Text>
          <Text style={styles.description}>{coverDescription}</Text>
        </View>

        <View style={styles.metaGrid}>
          <View>
            <Text style={styles.metaLabel}>Classification</Text>
            <Text style={[styles.metaValue, { color: '#dc2626' }]}>{cls}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>{dateLbl}</Text>
            <Text style={[styles.metaValue, { color: slate[800] }]}>
              {formattedDate}
            </Text>
          </View>
        </View>

        {workspaceName && (
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Workspace</Text>
              <Text style={[styles.metaValue, { color: slate[800] }]}>{workspaceName}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Text style={styles.copyright}>
          © 2026 {systemName}. All Rights Reserved.
        </Text>
        <Text style={styles.classification}>{cls}</Text>
      </View>
    </Page>
  );
};
