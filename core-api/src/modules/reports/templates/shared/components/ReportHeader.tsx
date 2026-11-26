import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    paddingHorizontal: 56,
    paddingVertical: 6,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: slate[200],
    fontFamily: 'Inter',
  },
  leftSection: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    height: 24,
    width: 24,
  },
  logoFallback: {
    width: 24,
    height: 24,
    borderRadius: 3,
    backgroundColor: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'Inter',
  },
  reportTitle: {
    fontSize: 9,
    fontWeight: '600',
    color: slate[500],
    fontFamily: 'Inter',
    lineHeight: 1,
  },
});

interface ReportHeaderProps {
  logoBase64?: string;
  reportTitle?: string;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  logoBase64,
  reportTitle,
}) => (
  <View style={styles.header} fixed>
    <View style={styles.leftSection}>
      {logoBase64 ? (
        <Image src={logoBase64} style={styles.logo} />
      ) : (
        <View style={styles.logoFallback}>
          <Text style={styles.logoFallbackText}>O</Text>
        </View>
      )}
    </View>
    <Text style={styles.reportTitle}>{reportTitle}</Text>
  </View>
);
