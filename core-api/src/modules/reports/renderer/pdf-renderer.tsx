import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReportData } from '../types/report-data.type';
import type { VulnerabilityReportData } from '../types/vulnerability-report-data.type';
import { SummaryReportDocument } from './summary/SummaryReportDocument';
import { VulnReportDocument } from './vuln/VulnReportDocument';

// Ensure fonts are registered once
import './fonts';

/**
 * Render a report document to a PDF buffer.
 * Accepts either 'SUMMARY' or 'VULNERABILITY' type with the matching data.
 */
export async function renderReportPdf(
  type: 'SUMMARY' | 'VULNERABILITY',
  data: ReportData | VulnerabilityReportData,
): Promise<Buffer> {
  // Merge server-side fields into data
  const enrichedData = {
    ...data,
    systemName: 'Open Attack Surface Management',
    classification: 'Strictly Confidential',
  };

  if (type === 'VULNERABILITY') {
    return renderToBuffer(
      <VulnReportDocument data={enrichedData as VulnerabilityReportData} />,
    );
  }

  return renderToBuffer(
    <SummaryReportDocument data={enrichedData as ReportData} />,
  );
}
