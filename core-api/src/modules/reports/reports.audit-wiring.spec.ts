jest.mock('./renderer/pdf-renderer', () => ({
  renderReportPdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

import { Reflector } from '@nestjs/core';
import { AUDIT_LOG_KEY, type AuditLogConfig } from '../audit/audit-log.decorator';
import { ReportsController } from './reports.controller';

describe('ReportsController audit wiring (M4.4 decorator events)', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<AuditLogConfig & { action: string }>(
      AUDIT_LOG_KEY,
      [method, ReportsController],
    );

  it.each([
    ['generateSummaryReport', 'report.generated'],
    ['previewSummaryReport', 'report.exported'],
    ['deleteReport', 'report.deleted'],
  ])('%s is wired to the %s event', (method, action) => {
    expect(auditConfig(ReportsController.prototype[method])).toEqual(
      expect.objectContaining({ action }),
    );
  });

  it('generateSummaryReport records reportType: summary as metadata', () => {
    expect(
      auditConfig(ReportsController.prototype.generateSummaryReport)?.metadata?.(
        {},
        undefined,
      ),
    ).toEqual({ reportType: 'summary' });
  });

  it('previewSummaryReport records format: pdf as metadata', () => {
    expect(
      auditConfig(ReportsController.prototype.previewSummaryReport)?.metadata?.(
        {},
        undefined,
      ),
    ).toEqual({ format: 'pdf' });
  });

  it('deleteReport is bare: no changes or metadata', () => {
    const config = auditConfig(ReportsController.prototype.deleteReport);
    expect(config?.changes).toBeUndefined();
    expect(config?.metadata).toBeUndefined();
    expect(config?.resourceId).toBeUndefined();
  });

  it('unwired read/generate handlers are NOT audit-decorated', () => {
    for (const method of ['getMany', 'previewVulReport', 'generateVulReport']) {
      expect(
        auditConfig(ReportsController.prototype[method as keyof ReportsController]),
      ).toBeUndefined();
    }
  });
});
