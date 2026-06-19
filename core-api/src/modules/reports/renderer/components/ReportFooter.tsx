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
    paddingHorizontal: 56,
    paddingVertical: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: slate[200],
    fontFamily: 'Inter',
    fontSize: 8,
    color: slate[400],
  },
  classification: {
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
  systemName,
  classification,
}) => (
  <View style={styles.footer} fixed>
    <Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Text>
    <Text style={styles.classification}>{classification}</Text>
  </View>
);
