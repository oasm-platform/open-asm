import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    fontFamily: 'Inter',
    wrap: false,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: slate[800],
    marginBottom: 4,
  },
  description: {
    fontSize: 8,
    color: slate[500],
    marginBottom: 8,
  },
  linksRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 24,
    fontSize: 8,
  },
  linkLabel: {
    fontWeight: '700',
    color: slate[700],
    fontFamily: 'Inter',
    fontSize: 8,
  },
  linkValue: {
    color: slate[500],
    fontFamily: 'Inter',
    fontSize: 8,
  },
});

export const ReportInfo: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Open Attack Surface Management</Text>
    <Text style={styles.description}>
      Open-source platform for cybersecurity Attack Surface Management (OASM).
    </Text>
    <View style={styles.linksRow}>
      <Text>
        <Text style={styles.linkLabel}>LinkedIn </Text>
        <Text style={styles.linkValue}>
          https://www.linkedin.com/company/oasm-platform
        </Text>
      </Text>
      <Text>
        <Text style={styles.linkLabel}>Github </Text>
        <Text style={styles.linkValue}>
          https://github.com/oasm-platform
        </Text>
      </Text>
    </View>
  </View>
);
