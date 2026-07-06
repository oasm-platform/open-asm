import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate, severityStyles } from '../theme';

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderWidth: 1,
    borderColor: slate[200],
    fontFamily: 'Inter',
  },
  title: {
    fontSize: 8,
    fontWeight: '600',
    color: slate[700],
    marginBottom: 8,
  },
  legendRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 8,
    fontWeight: '500',
    color: slate[700],
  },
  legendCount: {
    fontSize: 8,
    color: slate[500],
  },
  barContainer: {
    height: 8,
    display: 'flex',
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: slate[200],
  },
  barSegment: {
    height: '100%',
  },
});

interface SeverityDistributionItem {
  level: string;
  count: number;
  percent: number;
}

interface SeverityDistributionProps {
  severityDistribution: SeverityDistributionItem[];
}

export const SeverityDistribution: React.FC<SeverityDistributionProps> = ({
  severityDistribution,
}) => (
  <View style={styles.container}>
    <Text style={styles.title}>Severity Distribution</Text>
    <View style={styles.legendRow}>
      {severityDistribution.map((item) => {
        const key = item.level.toLowerCase() as keyof typeof severityStyles;
        const style = severityStyles[key] || severityStyles.low;
        return (
          <View key={item.level} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: style.dot }]} />
            <Text style={styles.legendLabel}>{item.level}</Text>
            <Text style={styles.legendCount}>({item.count})</Text>
          </View>
        );
      })}
    </View>
    <View style={styles.barContainer}>
      {severityDistribution.map((item) => {
        const key = item.level.toLowerCase() as keyof typeof severityStyles;
        const style = severityStyles[key] || severityStyles.low;
        return (
          <View
            key={item.level}
            style={[styles.barSegment, { width: `${item.percent}%`, backgroundColor: style.dot }]}
          />
        );
      })}
    </View>
  </View>
);
