import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderWidth: 1,
    borderColor: slate[200],
    flex: 1,
    fontFamily: 'Inter',
  },
  containerCritical: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  label: {
    fontSize: 7,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  labelText: {
    color: slate[500],
  },
  labelCritical: {
    color: '#dc2626',
  },
  valueRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 1,
  },
  valueText: {
    color: slate[900],
  },
  valueCritical: {
    color: '#dc2626',
  },
  changeContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  changeText: {
    fontSize: 7,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  changePositive: {
    color: '#16a34a',
  },
  changeNegative: {
    color: '#dc2626',
  },
  changeNeutral: {
    color: slate[400],
  },
});

interface MetricCardProps {
  label: string;
  value: string | number;
  critical?: boolean;
  subtext?: string;
  /** Change delta, e.g. "+8" or "-3" — shown with arrow */
  change?: number;
  /** If true, an increase is good (green). If false, increase is bad (red). */
  increaseIsPositive?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  critical,
  subtext,
  change,
  increaseIsPositive = true,
}) => {
  const hasChange = change !== undefined && change !== 0;
  const arrow = change !== undefined && change > 0 ? '\u2191' : change !== undefined && change < 0 ? '\u2193' : '';
  const absChange = change !== undefined ? Math.abs(change) : 0;

  // Determine color: if change is 0 or undefined → neutral
  // Otherwise check if positive change aligns with increaseIsPositive
  const changePositive = change !== undefined && change > 0;
  const changeNegative = change !== undefined && change < 0;
  const isGoodChange = changePositive && increaseIsPositive;
  const isBadChange = (changePositive && !increaseIsPositive) || (changeNegative && increaseIsPositive);

  return (
    <View
      style={{ ...styles.container, ...(critical ? styles.containerCritical : {}) }}
    >
      <Text style={[styles.label, critical ? styles.labelCritical : styles.labelText]}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, critical ? styles.valueCritical : styles.valueText]}>
          {value}
        </Text>
        {subtext && (
          <Text style={{ fontSize: 7, color: slate[500], fontFamily: 'Inter' }}>
            {subtext}
          </Text>
        )}
      </View>
      {hasChange && (
        <View style={styles.changeContainer}>
          <Text
            style={[
              styles.changeText,
              isGoodChange
                ? styles.changePositive
                : isBadChange
                  ? styles.changeNegative
                  : styles.changeNeutral,
            ]}
          >
            {arrow} {absChange} vs last week
          </Text>
        </View>
      )}
    </View>
  );
};
