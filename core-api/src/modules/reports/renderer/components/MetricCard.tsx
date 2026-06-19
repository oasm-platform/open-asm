import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderWidth: 1,
    borderColor: slate[200],
    flex: 1,
    fontFamily: 'Inter',
  },
  containerCritical: {
    borderColor: '#fecaca',
  },
  label: {
    fontSize: 8,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
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
    fontSize: 14,
    fontWeight: '700',
  },
  valueText: {
    color: slate[900],
  },
  valueCritical: {
    color: '#dc2626',
  },
  subtext: {
    fontSize: 8,
  },
  subtextText: {
    color: slate[500],
  },
  subtextCritical: {
    color: '#ef4444',
  },
});

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  critical?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  critical,
}) => (
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
        <Text style={[styles.subtext, critical ? styles.subtextCritical : styles.subtextText]}>
          {subtext}
        </Text>
      )}
    </View>
  </View>
);
