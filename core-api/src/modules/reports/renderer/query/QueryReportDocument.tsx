import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QueryReportData } from '../../types/query-report-data.type';
import { slate } from '../theme';
import { ReportFooter } from '../components/ReportFooter';
import { ReportHeader } from '../components/ReportHeader';
import { SectionHeader } from '../components/SectionHeader';

// Ensure fonts are registered
import '../fonts';

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingTop: 56,
    paddingBottom: 48,
    fontFamily: 'Inter',
    fontSize: 8,
    color: slate[800],
    lineHeight: 1.5,
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4, color: slate[900] },
  meta: { fontSize: 8, color: slate[500], marginBottom: 16 },
  description: { fontSize: 9, marginBottom: 16 },
  section: { marginBottom: 18 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: slate[300] },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: slate[200] },
  th: { flex: 1, fontSize: 7, fontWeight: 600, color: slate[600], paddingVertical: 4, paddingHorizontal: 4 },
  td: { flex: 1, fontSize: 7, paddingVertical: 3, paddingHorizontal: 4, fontFamily: 'JetBrains Mono' },
  note: { fontSize: 7, color: slate[500], marginTop: 4 },
  error: { fontSize: 8, color: '#b91c1c' },
});

/** A saved attack surface query rendered as one table per query. */
export const QueryReportDocument: React.FC<{ data: QueryReportData }> = ({ data }) => (
  <Document title={data.title}>
    <Page size="A4" orientation="landscape" style={styles.page} wrap>
      <ReportHeader logoBase64={data.logoBase64} reportTitle={data.title} />
      <Text style={styles.title}>{data.title}</Text>
      <Text style={styles.meta}>Generated {data.generatedAt}</Text>
      {data.description ? <Text style={styles.description}>{data.description}</Text> : null}
      {data.tables.map((table, index) => (
        <View key={table.name} style={styles.section}>
          <SectionHeader number={String(index + 1).padStart(2, '0')} title={table.name} />
          {table.error ? (
            <Text style={styles.error}>{table.error}</Text>
          ) : table.rows.length === 0 ? (
            <Text style={styles.note}>No rows.</Text>
          ) : (
            <View>
              <View style={styles.tableHeader} fixed>
                {table.columns.map((column) => (
                  <Text key={column} style={styles.th}>
                    {column}
                  </Text>
                ))}
              </View>
              {table.rows.map((row, r) => (
                <View key={r} style={styles.tableRow} wrap={false}>
                  {row.map((cell, c) => (
                    <Text key={c} style={styles.td}>
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
          {table.truncated ? <Text style={styles.note}>Showing the first rows only.</Text> : null}
        </View>
      ))}
      <ReportFooter systemName={data.systemName ?? ''} classification={data.classification ?? ''} />
    </Page>
  </Document>
);
