import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AuditOutcome, BullMQName } from '@/common/enums/enum';
import { NotFoundError } from '@/common/errors/domain.errors';
import { ArtifactsService } from '@/modules/artifacts/artifacts.service';
import { ArtifactFoldersService } from '@/modules/artifacts/artifact-folders.service';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { ReportSchedule } from './entities/report-schedule.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { StorageService } from '@/modules/storage/storage.service';
import { Report } from './entities/report.entity';
import { ReportsService } from './reports.service';
import { ReportRunner } from './report-runner';
import { AsqSavedQueriesService } from '@/modules/attack-surface-query/asq-saved-queries.service';

// The registry pulls in the React PDF documents, which Jest cannot load without rendering.
jest.mock('./templates/registry', () => ({ BUILTIN_TEMPLATES: {} }));
jest.mock('./templates/render', () => ({
  renderTemplatePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

describe('ReportsService', () => {
  let service: ReportsService;
  let reportRepository: Repository<Report>;
  let storageService: StorageService;
  const runner = { run: jest.fn(), validate: jest.fn() };
  const artifacts = { createFromBuffer: jest.fn(), deleteServerFile: jest.fn() };
  const scheduleRepo = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    save: jest.fn((s: object) => Promise.resolve({ id: 's1', ...s })),
    create: jest.fn((s: object) => s),
    delete: jest.fn(),
  };
  const workspaces = { getMembershipWithPermissions: jest.fn() };
  const eventBridge = { publishSafely: jest.fn() };
  const generateQueue = { add: jest.fn() };
  const scheduleQueue = { upsertJobScheduler: jest.fn(), removeJobScheduler: jest.fn(), getJobSchedulers: jest.fn() };

  const mockReport = {
    id: '123e4567-e89b-12d3-a456-42614174000',
    userId: 'user-1',
    path: 'reports/test-report.pdf',
    fileName: 'test-report.pdf',
    workspace: { id: 'workspace-1' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getCount: jest.fn(),
              getMany: jest.fn(),
            })),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
            deleteFile: jest.fn(),
            getPresignedDownloadUrl: jest.fn(),
          },
        },
        { provide: ReportRunner, useValue: runner },
        { provide: getRepositoryToken(ReportSchedule), useValue: scheduleRepo },
        { provide: ArtifactsService, useValue: artifacts },
        { provide: ArtifactFoldersService, useValue: { ensureWorkspaceFolder: jest.fn() } },
        { provide: WorkspacesService, useValue: workspaces },
        { provide: EventBridgeService, useValue: eventBridge },
        { provide: getQueueToken(BullMQName.REPORT_GENERATE), useValue: generateQueue },
        { provide: getQueueToken(BullMQName.REPORT_SCHEDULE), useValue: scheduleQueue },
        {
          provide: AsqSavedQueriesService,
          useValue: savedQueries,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    reportRepository = module.get<Repository<Report>>(
      getRepositoryToken(Report),
    );
    storageService = module.get<StorageService>(StorageService);
  });

  const savedQueries = {
    get: jest.fn(),
    runSpec: jest.fn(),
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should return a report by id and workspace', async () => {
      jest
        .spyOn(reportRepository, 'findOne')
        .mockResolvedValue(mockReport as Report);

      const result = await service.findById('report-1', 'workspace-1');
      expect(result).toEqual(mockReport);
    });

    it('should throw NotFoundException if report not found', async () => {
      jest.spyOn(reportRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.findById('non-existent', 'workspace-1'),
      ).rejects.toThrow('Report not found');
    });
  });

  describe('deleteReport', () => {
    it('should delete a report and its file', async () => {
      jest
        .spyOn(reportRepository, 'findOne')
        .mockResolvedValue(mockReport as Report);
      jest
        .spyOn(reportRepository, 'remove')
        .mockResolvedValue(mockReport as Report);

      await expect(
        service.deleteReport('report-1', 'workspace-1'),
      ).resolves.not.toThrow();

      expect(storageService.deleteFile).toHaveBeenCalledWith(
        'test-report.pdf',
        'reports',
      );
      expect(reportRepository.remove).toHaveBeenCalledWith(mockReport);
    });

    it('should still remove from DB even if file does not exist', async () => {
      jest
        .spyOn(reportRepository, 'findOne')
        .mockResolvedValue(mockReport as Report);
      jest.spyOn(storageService, 'deleteFile').mockImplementation(() => {
        throw new Error('ENOENT');
      });
      jest
        .spyOn(reportRepository, 'remove')
        .mockResolvedValue(mockReport as Report);

      await expect(
        service.deleteReport('report-1', 'workspace-1'),
      ).resolves.not.toThrow();

      expect(reportRepository.remove).toHaveBeenCalledWith(mockReport);
    });

    it('a report stored as an artifact frees it (and its quota) through the artifacts module', async () => {
      jest
        .spyOn(reportRepository, 'findOne')
        .mockResolvedValue({ ...mockReport, artifactId: 'a1' } as Report);

      await service.deleteReport('report-1', 'workspace-1');

      expect(artifacts.deleteServerFile).toHaveBeenCalledWith('a1');
      expect(storageService.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('getMany', () => {
    it('lists the rows without presigning a download URL for each', async () => {
      const rows = [{ ...mockReport, path: 'artifacts/workspaces/w1/a1/r.pdf' }];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      jest.spyOn(reportRepository, 'createQueryBuilder').mockReturnValue(qb as never);

      const result = await service.getMany(
        { limit: 10, page: 1, sortBy: 'createdAt', sortOrder: 'DESC' } as never,
        'w1',
      );

      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
      expect(result.data).toEqual(rows);
      expect(result.data[0]).not.toHaveProperty('downloadUrl');
    });
  });

  describe('getDownloadUrl', () => {
    it("presigns the report's object as a PDF named after the report", async () => {
      jest.spyOn(reportRepository, 'findOne').mockResolvedValue({
        ...mockReport,
        path: 'artifacts/workspaces/w1/a1/acme-vulnerability-report-2026-11-27-1430.pdf',
        fileName: 'acme-vulnerability-report-2026-11-27-1430.pdf',
      } as Report);
      jest
        .spyOn(storageService, 'getPresignedDownloadUrl')
        .mockResolvedValue({ url: 'https://storage.test/r.pdf?sig=1', expiresIn: 300 });

      await expect(service.getDownloadUrl('r1', 'w1')).resolves.toEqual({
        url: 'https://storage.test/r.pdf?sig=1',
        expiresIn: 300,
      });
      expect(reportRepository.findOne).toHaveBeenCalledWith({ where: { id: 'r1', workspace: { id: 'w1' } } });
      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith({
        bucket: 'artifacts',
        key: 'workspaces/w1/a1/acme-vulnerability-report-2026-11-27-1430.pdf',
        fileName: 'acme-vulnerability-report-2026-11-27-1430.pdf',
        contentType: 'application/pdf',
        disposition: 'attachment',
      });
    });

    it('presigns an inline disposition when the console previews the report', async () => {
      jest.spyOn(reportRepository, 'findOne').mockResolvedValue({
        ...mockReport,
        path: 'artifacts/workspaces/w1/a1/r.pdf',
        fileName: 'r.pdf',
      } as Report);
      jest
        .spyOn(storageService, 'getPresignedDownloadUrl')
        .mockResolvedValue({ url: 'https://storage.test/r.pdf?sig=1', expiresIn: 300 });

      await service.getDownloadUrl('r1', 'w1', 'inline');

      expect(storageService.getPresignedDownloadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ disposition: 'inline' }),
      );
    });

    it('is 404 for a report of another workspace, and signs nothing', async () => {
      jest.spyOn(reportRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getDownloadUrl('r1', 'w2')).rejects.toBeInstanceOf(NotFoundError);
      expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
  });

  const scope = { workspaceId: 'w1', permissions: ['*'], caller: 'report' as const };
  const completed = () => eventBridge.publishSafely.mock.calls[0][1] as { outcome: AuditOutcome };

  describe('queueing', () => {
    it('validates as the caller, then queues with a snapshot of their permissions', async () => {
      await service.enqueueReport(scope, 'u1', 'VULNERABILITY', { minSeverity: 'HIGH' });
      expect(runner.validate).toHaveBeenCalled();
      expect(generateQueue.add).toHaveBeenCalledWith('VULNERABILITY', {
        workspaceId: 'w1',
        userId: 'u1',
        permissions: ['*'],
        type: 'VULNERABILITY',
        options: { minSeverity: 'HIGH' },
      });
    });

    it('queues nothing when validation fails', async () => {
      runner.validate.mockImplementationOnce(() => {
        throw new Error('PERMISSION_DENIED');
      });
      await expect(service.enqueueReport(scope, 'u1', 'SUMMARY')).rejects.toThrow('PERMISSION_DENIED');
      expect(generateQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('runJob', () => {
    const job = { workspaceId: 'w1', userId: 'u1', permissions: ['*'], type: 'SUMMARY' as const };

    it('publishes a successful report.completed to its user', async () => {
      jest.spyOn(service, 'generateReport').mockResolvedValue({ filePath: 'p', fileName: 'r.pdf' });
      await service.runJob(job);
      expect(completed()).toEqual(
        expect.objectContaining({
          workspaceId: 'w1',
          outcome: AuditOutcome.Success,
          payload: expect.objectContaining({ userId: 'u1', reportType: 'SUMMARY', fileName: 'r.pdf' }),
        }),
      );
    });

    it('turns a failure (e.g. quota exceeded) into a failed report.completed instead of throwing', async () => {
      jest.spyOn(service, 'generateReport').mockRejectedValue(
        new ConflictException({ code: 'STORAGE_QUOTA_EXCEEDED', message: 'Workspace storage quota exceeded' }),
      );
      await expect(service.runJob(job)).resolves.toBeUndefined();
      expect(completed()).toEqual(
        expect.objectContaining({
          outcome: AuditOutcome.Failure,
          payload: expect.objectContaining({ error: 'Workspace storage quota exceeded' }),
        }),
      );
    });

    it('keeps a raw internal error out of the notification', async () => {
      jest.spyOn(service, 'generateReport').mockRejectedValue(new Error('relation "assets" does not exist'));
      await service.runJob(job);
      expect(completed()).toEqual(
        expect.objectContaining({ payload: expect.objectContaining({ error: 'Report generation failed' }) }),
      );
    });

    it('renders nothing without report.write', async () => {
      const generate = jest.spyOn(service, 'generateReport');
      await service.runJob({ ...job, permissions: ['report.read'] });
      expect(generate).not.toHaveBeenCalled();
      expect(completed().outcome).toBe(AuditOutcome.Failure);
    });
  });

  describe('schedules', () => {
    const schedule = { id: 's1', workspaceId: 'w1', userId: 'u1', type: 'SUMMARY', cron: '0 8 * * 1', options: {} };

    it('createSchedule validates, saves and registers a job scheduler', async () => {
      await service.createSchedule(scope, 'u1', { type: 'SUMMARY', cron: '0 8 * * 1' });
      expect(runner.validate).toHaveBeenCalled();
      expect(scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'report-schedule:s1',
        { pattern: '0 8 * * 1' },
        { name: 's1', data: { scheduleId: 's1' } },
      );
    });

    it('createSchedule removes the row when the scheduler cannot be registered', async () => {
      scheduleQueue.upsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));
      await expect(service.createSchedule(scope, 'u1', { type: 'SUMMARY', cron: '0 8 * * 1' })).rejects.toThrow(
        'redis down',
      );
      expect(scheduleRepo.delete).toHaveBeenCalledWith('s1');
    });

    it('reconcileSchedules re-registers every row and drops schedulers without one', async () => {
      scheduleQueue.getJobSchedulers.mockResolvedValue([{ key: 'report-schedule:s1' }, { key: 'report-schedule:gone' }]);
      scheduleRepo.find.mockResolvedValue([schedule]);
      await expect(service.reconcileSchedules()).resolves.toEqual({ registered: 1, removed: 1 });
      expect(scheduleQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'report-schedule:s1',
        { pattern: '0 8 * * 1' },
        { name: 's1', data: { scheduleId: 's1' } },
      );
      expect(scheduleQueue.removeJobScheduler).toHaveBeenCalledTimes(1);
      expect(scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('report-schedule:gone');
    });

    it('deleteSchedule removes the scheduler and the row; 404 for another workspace', async () => {
      scheduleRepo.findOneBy.mockResolvedValueOnce(schedule);
      await service.deleteSchedule('s1', 'w1');
      expect(scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('report-schedule:s1');
      expect(scheduleRepo.delete).toHaveBeenCalledWith('s1');

      scheduleRepo.findOneBy.mockResolvedValueOnce(null);
      await expect(service.deleteSchedule('s1', 'w2')).rejects.toThrow('Report schedule not found');
    });

    it('runSchedule runs with the owner permissions as they are now', async () => {
      scheduleRepo.findOneBy.mockResolvedValue(schedule);
      workspaces.getMembershipWithPermissions.mockResolvedValue({ permissionKeys: ['report.write'] });
      const run = jest.spyOn(service, 'runJob').mockResolvedValue();
      await service.runSchedule('s1');
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', permissions: ['report.write'], scheduled: true }),
      );
    });

    it('runSchedule drops a schedule whose owner left the workspace', async () => {
      scheduleRepo.findOneBy.mockResolvedValue(schedule);
      workspaces.getMembershipWithPermissions.mockRejectedValue(new NotFoundError('not a member'));
      const run = jest.spyOn(service, 'runJob');
      await service.runSchedule('s1', 'key');
      expect(run).not.toHaveBeenCalled();
      expect(scheduleQueue.removeJobScheduler).toHaveBeenCalledWith('key');
      expect(scheduleRepo.delete).toHaveBeenCalledWith('s1');
    });
  });
});
