import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { ReportsController } from './reports.controller';

jest.mock('./renderer/pdf-renderer', () => ({
  renderReportPdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

describe('ReportsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getMany', 'GET /', ['report.read']],
    ['previewSummaryReport', 'GET /preview/summary', ['report.read']],
    ['previewVulReport', 'GET /preview/vulnerability', ['report.read']],
    ['generateSummaryReport', 'POST /generate/summary', ['report.write']],
    ['generateVulReport', 'POST /generate/vulnerability', ['report.write']],
    ['deleteReport', 'DELETE /:id', ['report.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (ReportsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      ReportsController,
    ]);
    expect(required).toEqual(keys);
  });
});
