import { WorkerScope, WorkerType } from '@/common/enums/enum';
import type { DataSource } from 'typeorm';
import type { ConnectorRegistryService } from '../connectors/connector-registry.service';
import type { StorageService } from '../storage/storage.service';
import { WorkerInstance } from '../workers/entities/worker.entity';
import { JobDispatchService } from './job-dispatch.service';
import type { JobsRegistryService } from './jobs-registry.service';

describe('JobDispatchService', () => {
  let service: JobDispatchService;

  const mockDataSource = {
    createQueryRunner: jest.fn(),
    getRepository: jest.fn(),
  };

  const mockStorageService = {
    upload: jest.fn(),
  };

  const mockConnectorRegistryService = {
    getConnector: jest.fn(),
    getAllConnectors: jest.fn().mockReturnValue([]),
  };

  let mockJobsRegistry: { handleJobError: jest.Mock };

  beforeEach(() => {
    mockJobsRegistry = { handleJobError: jest.fn().mockResolvedValue(undefined) };
    service = new JobDispatchService(
      mockDataSource as unknown as DataSource,
      mockConnectorRegistryService as unknown as ConnectorRegistryService,
      mockStorageService as unknown as StorageService,
      mockJobsRegistry as unknown as JobsRegistryService,
    );
  });

  describe('getNextJobs — batched claim', () => {
    const buildWorker = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id: 'worker-uuid',
      type: WorkerType.BUILT_IN,
      scope: WorkerScope.CLOUD,
      runMode: 'node',
      internalNetworkId: null,
      workspace: { id: 'workspace-uuid' },
      tool: null,
      ...overrides,
    });

    const buildQueryRunner = (jobs: unknown[]) => {
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        setOnLocked: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(jobs),
      };

      const queryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(qb),
          update: jest.fn().mockResolvedValue({ affected: jobs.length }),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      };

      return { qb, queryRunner };
    };

    const givenWorkerAndQueue = (worker: unknown, jobs: unknown[]) => {
      const { qb, queryRunner } = buildQueryRunner(jobs);
      mockDataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue(worker),
      } as any);
      mockDataSource.createQueryRunner.mockReturnValue(queryRunner as any);
      return { qb, queryRunner };
    };

    beforeEach(() => {
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([]);
    });

    it('claims up to `limit` jobs in one query and one update', async () => {
      // Given: three pending jobs and a worker with three free slots
      const jobs = [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
        { id: 'job-2', asset: { id: 'a2', value: 'y' } },
        { id: 'job-3', asset: { id: 'a3', value: 'z' } },
      ];
      const { qb, queryRunner } = givenWorkerAndQueue(buildWorker(), jobs);

      // When
      const result = await service.getNextJobs('worker-uuid', 3);

      // Then: a single claim replaces three per-slot claims
      expect(result).toHaveLength(3);
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(WorkerInstance);
      expect(qb.limit).toHaveBeenCalledWith(3);
      expect(queryRunner.manager.update).toHaveBeenCalledTimes(1);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('skips rows another claim has locked instead of waiting on them', async () => {
      // Given
      const { qb } = givenWorkerAndQueue(buildWorker(), []);

      // When
      await service.getNextJobs('worker-uuid', 5);

      // Then: FOR UPDATE OF jobs SKIP LOCKED
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, [
        'jobs',
      ]);
      expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
    });

    it('caps the claim so a worker cannot drain the whole queue', async () => {
      // Given: a worker asking for far more than the server-side ceiling
      const { qb } = givenWorkerAndQueue(buildWorker(), []);

      // When
      await service.getNextJobs('worker-uuid', 100000);

      // Then
      expect(qb.limit).toHaveBeenCalledWith(100);
    });

    it('returns an empty list and rolls back when nothing is claimable', async () => {
      // Given: an idle queue
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), []);

      // When
      const result = await service.getNextJobs('worker-uuid', 5);

      // Then: no work is claimed and nothing is written
      expect(result).toEqual([]);
      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('enforces job eligibility in SQL instead of dropping the whole claim', async () => {
      // Given: a node worker that is allowed to run connectors
      mockConnectorRegistryService.getAllConnectors.mockReturnValue([
        { slug: 'nuclei' },
      ]);
      const { qb } = givenWorkerAndQueue(buildWorker(), []);

      // When
      await service.getNextJobs('worker-uuid', 2);

      // Then: "has a command or belongs to a connector" is a WHERE clause, so a
      // command-less non-connector job at the head of the queue can no longer
      // starve the rest of the batch (the previous post-query filter did).
      const predicates = qb.andWhere.mock.calls.map((call) => String(call[0]));
      expect(
        predicates.some((sql) => sql.includes('jobs.command IS NOT NULL')),
      ).toBe(true);
      expect(predicates.some((sql) => sql.includes('connectorSlugs'))).toBe(
        true,
      );
    });

    it('does not require the connector clause on a cli-mode worker', async () => {
      // Given: a CLI worker that has no Docker and therefore no connector tools
      const { qb } = givenWorkerAndQueue(buildWorker({ runMode: 'cli' }), []);

      // When
      await service.getNextJobs('worker-uuid', 2);

      // Then: only the command check applies
      const predicates = qb.andWhere.mock.calls.map((call) => String(call[0]));
      expect(
        predicates.some((sql) => sql.includes('jobs.command IS NOT NULL')),
      ).toBe(true);
      expect(predicates.some((sql) => sql.includes('connectorSlugs'))).toBe(
        false,
      );
    });

    it('getNextJob delegates to the batched claim', async () => {
      // Given: one claimable job
      const { qb } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);

      // When
      const job = await service.getNextJob('worker-uuid');

      // Then
      expect(job?.id).toBe('job-1');
      expect(qb.limit).toHaveBeenCalledWith(1);
    });

    it('getNextJob returns null when the claim is empty', async () => {
      givenWorkerAndQueue(buildWorker(), []);

      await expect(service.getNextJob('worker-uuid')).resolves.toBeNull();
    });

    it('does not roll back a committed claim when attaching templates fails', async () => {
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);
      (queryRunner as any).isTransactionActive = true;
      queryRunner.commitTransaction.mockImplementation(() => {
        (queryRunner as any).isTransactionActive = false;
      });
      jest
        .spyOn(service as any, 'attachCustomTemplates')
        .mockRejectedValue(new Error('boom'));

      await expect(service.getNextJobs('worker-uuid', 1)).resolves.toEqual([]);

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and returns [] when the claim fails before commit', async () => {
      const { queryRunner } = givenWorkerAndQueue(buildWorker(), [
        { id: 'job-1', asset: { id: 'a1', value: 'x' } },
      ]);
      (queryRunner as any).isTransactionActive = true;
      queryRunner.manager.update.mockRejectedValue(new Error('update failed'));

      await expect(service.getNextJobs('worker-uuid', 1)).resolves.toEqual([]);

      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    describe('custom templates', () => {
      const templateJob = (id: string) => ({
        id,
        retryCount: 0,
        tool: { id: 'tool-1', name: 'nuclei' },
        asset: { id: `a-${id}`, value: 'x', target: { workspaceId: 'ws-1' } },
        config: { rateLimit: 10, customTemplateIds: ['t1', 't2'] },
      });

      const givenTemplates = (rows: unknown[]) => {
        const artifactRepo = { find: jest.fn().mockResolvedValue(rows) };
        mockDataSource.getRepository.mockImplementation((entity: unknown) =>
          entity === WorkerInstance
            ? { findOne: jest.fn().mockResolvedValue(buildWorker()) }
            : artifactRepo,
        );
        return artifactRepo;
      };

      beforeEach(() => {
        (mockStorageService as Record<string, jest.Mock>).getPresignedDownloadUrl =
          jest.fn(({ key }: { key: string }) =>
            Promise.resolve({ url: `http://rustfs:9000/${key}?sig`, expiresIn: 3600 }),
          );
      });

      it('swaps template ids for presigned urls, signing each run once', async () => {
        givenWorkerAndQueue(buildWorker(), [templateJob('j1'), templateJob('j2')]);
        const artifactRepo = givenTemplates([
          { id: 't2', bucket: 'artifacts', objectKey: 'k2', updatedAt: new Date(7) },
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);

        const result = await service.getNextJobs('worker-uuid', 2);

        expect(result).toHaveLength(2);
        expect(result[0].config).toEqual({
          rateLimit: 10,
          customTemplates: [
            { url: 'http://rustfs:9000/k1?sig', cacheKey: 't1-5' },
            { url: 'http://rustfs:9000/k2?sig', cacheKey: 't2-7' },
          ],
        });
        expect(artifactRepo.find).toHaveBeenCalledTimes(1);
        expect(artifactRepo.find).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ workspaceId: 'ws-1' }),
          }),
        );
        expect(
          (mockStorageService as Record<string, jest.Mock>).getPresignedDownloadUrl,
        ).toHaveBeenCalledWith(expect.objectContaining({ absolute: true }));
      });

      it('fails a job whose template is gone instead of dispatching it', async () => {
        givenWorkerAndQueue(buildWorker(), [templateJob('j1')]);
        givenTemplates([
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);

        const result = await service.getNextJobs('worker-uuid', 1);

        expect(result).toEqual([]);
        // Fails the job (only while IN_PROGRESS) and logs why: see
        // JobsRegistryService.handleJobError
        expect(mockJobsRegistry.handleJobError).toHaveBeenCalledWith(
          { jobId: 'j1', data: {} },
          expect.objectContaining({ id: 'j1' }),
          new Error('A custom template of this run no longer exists'),
        );
      });

      it('still dispatches the rest of the batch when failing a job throws', async () => {
        givenWorkerAndQueue(buildWorker(), [
          templateJob('j1'),
          { id: 'j2', retryCount: 0, tool: { id: 'tool-1', name: 'nuclei' }, asset: { id: 'a-j2', value: 'x' }, config: {} },
        ]);
        givenTemplates([
          { id: 't1', bucket: 'artifacts', objectKey: 'k1', updatedAt: new Date(5) },
        ]);
        mockJobsRegistry.handleJobError.mockRejectedValue(new Error('db down'));

        const result = await service.getNextJobs('worker-uuid', 2);

        expect(result.map((j) => (j as { id: string }).id)).toEqual(['j2']);
      });
    });
  });
});
