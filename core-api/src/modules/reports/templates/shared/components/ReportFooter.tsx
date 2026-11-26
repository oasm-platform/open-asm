import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 30,
  },
  separatorLine: {
    height: 1,
    width: '100%',
    backgroundColor: slate[200],
  },
  pageNumber: {
    position: 'absolute',
    left: 56,
    top: 10,
    fontFamily: 'Inter',
    fontSize: 8,
    color: slate[400],
  },
  classification: {
    position: 'absolute',
    right: 56,
    top: 10,
    fontSize: 8,
    color: '#dc2626',
    fontFamily: 'Inter',
  },
});

interface ReportFooterProps {
  systemName?: string;
  classification?: string;
}

export const ReportFooter: React.FC<ReportFooterProps> = ({
  systemName: _systemName,
  classification,
}) => (
  <View style={styles.footer} fixed>
    <View style={styles.separatorLine} />

    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) =>
        `${pageNumber - 1} / ${totalPages - 1}`
      }
    />

    <Text style={styles.classification}>{classification || ''}</Text>
  </View>
);
