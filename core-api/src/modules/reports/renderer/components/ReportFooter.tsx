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
    paddingVertical: 8,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: slate[200],
    fontFamily: 'Inter',
    fontSize: 8,
    color: slate[400],
  },
});

interface ReportFooterProps {
  systemName?: string;
  classification?: string;
}

export const ReportFooter: React.FC<ReportFooterProps> = () => (
  <View style={styles.footer} fixed>
    <Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Text>
  </View>
);
