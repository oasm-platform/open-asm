import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  barRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 64,
    marginBottom: 4,
  },
  bar: {
    flex: 1,
    backgroundColor: slate[700],
    borderRadius: 2,
    minHeight: 4,
  },
  barLabel: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: slate[400],
    fontFamily: 'Inter',
  },
});

interface BarChartProps {
  data: number[];
  maxValue?: number;
  height?: number;
  gap?: number;
  showLabels?: boolean;
  labelStart?: string;
  labelEnd?: string;
  minBarPct?: number;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  maxValue,
  height = 64,
  gap = 2,
  showLabels = false,
  labelStart = '30 days ago',
  labelEnd = 'Today',
  minBarPct = 5,
}) => {
  const max = maxValue ?? Math.max(...data, 1);

  return (
    <View>
      <View style={[styles.barRow, { height, gap }]}>
        {data.map((val, i) => {
          const heightPct = (val / max) * 100;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                { height: `${Math.max(heightPct, minBarPct)}%`, minHeight: 4 },
              ]}
            />
          );
        })}
      </View>
      {showLabels && (
        <View style={styles.barLabel}>
          <Text>{labelStart}</Text>
          <Text>{labelEnd}</Text>
        </View>
      )}
    </View>
  );
};
