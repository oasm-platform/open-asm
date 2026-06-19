import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { slate } from '../theme';

const styles = StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: slate[200],
    break: 'avoid',
  },
  number: {
    fontSize: 9,
    fontWeight: '700',
    color: slate[400],
    fontFamily: 'Inter',
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: slate[800],
    fontFamily: 'Inter',
  },
});

interface SectionHeaderProps {
  number: string;
  title: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  number,
  title,
}) => (
  <View style={styles.container}>
    <Text style={styles.number}>{number}</Text>
    <Text style={styles.title}>{title}</Text>
  </View>
);
