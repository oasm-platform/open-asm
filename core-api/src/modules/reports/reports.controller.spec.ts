import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { AsqErrorInterceptor } from '@/modules/attack-surface-query/asq-error.interceptor';
import { ReportsController } from './reports.controller';

// The registry pulls in the React PDF documents, which Jest cannot load without rendering.
jest.mock('./templates/registry', () => ({ BUILTIN_TEMPLATES: {} }));
jest.mock('./templates/render', () => ({
  renderTemplatePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
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
    ['listSchedules', 'GET /schedules', ['report.read']],
    ['createSchedule', 'POST /schedules', ['report.write']],
    ['deleteSchedule', 'DELETE /schedules/:id', ['report.write']],
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

describe('ReportsController query scope and error mapping', () => {
  const proto = ReportsController.prototype as unknown as Record<string, object>;

  it.each(['previewSummaryReport', 'previewVulReport', 'generateSummaryReport', 'generateVulReport', 'generateQueryReport', 'createSchedule'])(
    '%s maps AsqError through AsqErrorInterceptor',
    (method) => {
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, proto[method])).toContain(AsqErrorInterceptor);
    },
  );

  const scope = { workspaceId: 'w1', permissions: ['asset.read'], caller: 'report' };
  const req = { permissions: ['asset.read'] } as never;
  const res = { set: jest.fn(), end: jest.fn() } as never;

  function build() {
    const service = {
      previewSummaryReport: jest.fn().mockResolvedValue(Buffer.from('p')),
      previewVulnerabilityReport: jest.fn().mockResolvedValue(Buffer.from('p')),
      enqueueReport: jest.fn().mockResolvedValue(undefined),
      enqueueQueryReport: jest.fn().mockResolvedValue(undefined),
    };
    return { service, controller: new ReportsController(service as never) };
  }

  it('runs every preview and generate route as caller "report" with the request permissions', async () => {
    const { service, controller } = build();
    await controller.previewSummaryReport({}, 'w1', req, res);
    await controller.previewVulReport({}, 'w1', req, res);
    await controller.generateSummaryReport({}, 'w1', 'u1', req);
    await controller.generateVulReport({}, 'w1', 'u1', req);
    await controller.generateQueryReport({ savedQueryId: 'q' }, 'w1', 'u1', req);

    expect(service.previewSummaryReport).toHaveBeenCalledWith(scope, expect.anything());
    expect(service.previewVulnerabilityReport).toHaveBeenCalledWith(scope, expect.anything());
    expect(service.enqueueReport).toHaveBeenNthCalledWith(1, scope, 'u1', 'SUMMARY', expect.anything());
    expect(service.enqueueReport).toHaveBeenNthCalledWith(2, scope, 'u1', 'VULNERABILITY', expect.anything());
    expect(service.enqueueQueryReport).toHaveBeenCalledWith(scope, 'u1', 'q');
  });

  it('falls back to no permissions when the request carries none', async () => {
    const { service, controller } = build();
    await controller.generateSummaryReport({}, 'w1', 'u1', {} as never);
    expect(service.enqueueReport).toHaveBeenCalledWith(
      { workspaceId: 'w1', permissions: [], caller: 'report' },
      'u1',
      'SUMMARY',
      expect.anything(),
    );
  });
});
