import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BullMQName } from '@/common/enums/enum';
import { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { ReportSchedule } from './entities/report-schedule.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorageService } from '@/modules/storage/storage.service';
import { AsqSavedQueriesService } from '@/modules/attack-surface-query/asq-saved-queries.service';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { Report } from './entities/report.entity';
import { ReportRunner } from './report-runner';
import { ReportsService } from './reports.service';
import { renderTemplatePdf } from './templates/render';

// Sentinel templates: the real ones pull in React PDF documents Jest cannot load.
jest.mock('./templates/registry', () => ({
  BUILTIN_TEMPLATES: {
    summary: { id: 'summary', Document: 'SummaryDoc' },
    vulnerability: { id: 'vulnerability', Document: 'VulnDoc' },
    query: { id: 'query', Document: 'QueryDoc' },
  },
}));
jest.mock('./templates/render', () => ({
  renderTemplatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

const scope: QueryScope = { workspaceId: 'w1', permissions: ['*'], caller: 'report' };

describe('ReportsService routes reports to their builtin template', () => {
  let service: ReportsService;
  const runner = { run: jest.fn() };
  const repo = { save: jest.fn() };
  const storage = { uploadFile: jest.fn() };
  const artifacts = { createFromBuffer: jest.fn(), deleteServerFile: jest.fn() };
  const savedQueries = { get: jest.fn() };
  const render = renderTemplatePdf as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    runner.run.mockResolvedValue({ title: 'data' });
    artifacts.createFromBuffer.mockResolvedValue({ id: 'a1' });
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: repo },
        { provide: StorageService, useValue: storage },
        { provide: ReportRunner, useValue: runner },
        { provide: AsqSavedQueriesService, useValue: savedQueries },
        { provide: getRepositoryToken(ReportSchedule), useValue: {} },
        { provide: ArtifactsService, useValue: artifacts },
        { provide: WorkspacesService, useValue: {} },
        { provide: EventBridgeService, useValue: {} },
        { provide: getQueueToken(BullMQName.REPORT_GENERATE), useValue: {} },
        { provide: getQueueToken(BullMQName.REPORT_SCHEDULE), useValue: {} },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  const templateRun = () => (runner.run.mock.calls[0][0] as { id: string }).id;
  const renderedWith = () => (render.mock.calls[0][0] as { id: string }).id;

  it('generateReport SUMMARY uses the summary template', async () => {
    await service.generateReport(scope, 'u1', 'SUMMARY', { targetIds: ['t'] });
    expect(templateRun()).toBe('summary');
    expect(renderedWith()).toBe('summary');
    expect(runner.run).toHaveBeenCalledWith(expect.anything(), scope, { targetIds: ['t'] });
    expect(artifacts.createFromBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', userId: 'u1', source: 'report', mimeType: 'application/pdf' }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SUMMARY',
        artifactId: 'a1',
        path: expect.stringMatching(/^artifacts\/workspaces\/w1\/a1\/report-summary-.+\.pdf$/),
      }),
    );
  });

  it('generateReport VULNERABILITY uses the vulnerability template', async () => {
    await service.generateReport(scope, 'u1', 'VULNERABILITY');
    expect(templateRun()).toBe('vulnerability');
    expect(renderedWith()).toBe('vulnerability');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'VULNERABILITY' }));
  });

  it('previewSummaryReport converts the dates and uses the summary template', async () => {
    await expect(service.previewSummaryReport(scope, { startDate: '2026-01-01' })).resolves.toEqual(Buffer.from('pdf'));
    expect(templateRun()).toBe('summary');
    expect(renderedWith()).toBe('summary');
    expect(runner.run.mock.calls[0][2].startDate).toEqual(new Date('2026-01-01'));
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('previewVulnerabilityReport uses the vulnerability template', async () => {
    await service.previewVulnerabilityReport(scope, { minSeverity: 'HIGH' });
    expect(templateRun()).toBe('vulnerability');
    expect(renderedWith()).toBe('vulnerability');
    expect(runner.run.mock.calls[0][2].minSeverity).toBe('HIGH');
  });

  it('generateQueryReport loads the saved query and uses the query template', async () => {
    savedQueries.get.mockResolvedValue({ name: 'Ports', description: 'd', spec: { queries: {} } });
    await service.generateQueryReport(scope, 'u1', 'q1');
    expect(savedQueries.get).toHaveBeenCalledWith('w1', 'q1');
    expect(templateRun()).toBe('query');
    expect(renderedWith()).toBe('query');
    expect(runner.run).toHaveBeenCalledWith(expect.anything(), scope, {
      spec: { queries: {} },
      title: 'Ports',
      description: 'd',
    });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'QUERY' }));
  });

  it.each([
    ['SUMMARY' as const],
    ['VULNERABILITY' as const],
  ])('a failing runner uploads nothing and saves no row (%s)', async (type) => {
    runner.run.mockRejectedValue(new Error('query failed'));
    await expect(service.generateReport(scope, 'u1', type)).rejects.toThrow('query failed');
    expect(artifacts.createFromBuffer).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('a row that fails to save deletes its artifact, so the quota is freed', async () => {
    repo.save.mockRejectedValueOnce(new Error('db down'));
    await expect(service.generateReport(scope, 'u1', 'SUMMARY')).rejects.toThrow('db down');
    expect(artifacts.deleteServerFile).toHaveBeenCalledWith('a1');
  });

  it('a failing runner stops a query report too', async () => {
    savedQueries.get.mockResolvedValue({ name: 'n', description: null, spec: {} });
    runner.run.mockRejectedValue(new Error('nope'));
    await expect(service.generateQueryReport(scope, 'u1', 'q1')).rejects.toThrow('nope');
    expect(artifacts.createFromBuffer).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
