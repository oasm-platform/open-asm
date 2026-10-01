import { RedisLockService } from '@/services/redis/distributed-lock.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { WorkflowRunReconcilerService } from './workflow-run-reconciler.service';
import { WorkflowRunnerService } from './workflow-runner.service';

describe('WorkflowRunReconcilerService', () => {
  let service: WorkflowRunReconcilerService;

  const dataSource = { query: jest.fn() };
  const workflowRunner = { advanceRun: jest.fn() };
  const redisLock = {
    withLock: jest.fn(
      (_key: string, _ttl: number, action: () => Promise<unknown>) => action(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    redisLock.withLock.mockImplementation(
      (_key: string, _ttl: number, action: () => Promise<unknown>) =>
        action(),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunReconcilerService,
        { provide: DataSource, useValue: dataSource },
        { provide: WorkflowRunnerService, useValue: workflowRunner },
        { provide: RedisLockService, useValue: redisLock },
      ],
    }).compile();

    service = module.get(WorkflowRunReconcilerService);
  });

  it('advances every unfinished run whose jobs have all reached a terminal state', async () => {
    dataSource.query.mockResolvedValue([{ id: 'history-1' }, { id: 'history-2' }]);

    await service.reconcileStalledRuns();

    expect(workflowRunner.advanceRun).toHaveBeenCalledTimes(2);
    expect(workflowRunner.advanceRun).toHaveBeenNthCalledWith(1, 'history-1');
    expect(workflowRunner.advanceRun).toHaveBeenNthCalledWith(2, 'history-2');
  });

  // The whole point of the sweep: an advance is only triggered by a job finishing,
  // so a run whose last advance was lost stays stuck forever — with all its jobs
  // done and its next step never dispatched.
  it('selects exactly the runs that are unfinished, have jobs, and none left running', async () => {
    dataSource.query.mockResolvedValue([]);

    await service.reconcileStalledRuns();

    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('h."isCompleted" = false');
    expect(sql).toContain('h."workflowId" IS NOT NULL');
    expect(sql).toContain('EXISTS (SELECT 1 FROM jobs');
    expect(sql).toContain("j.status IN ('pending', 'in_progress')");
    expect(params).toEqual([7, 50]);
  });

  it('keeps going when one run cannot be advanced', async () => {
    dataSource.query.mockResolvedValue([{ id: 'broken' }, { id: 'healthy' }]);
    workflowRunner.advanceRun.mockRejectedValueOnce(new Error('deadlock'));

    await service.reconcileStalledRuns();

    expect(workflowRunner.advanceRun).toHaveBeenCalledTimes(2);
    expect(workflowRunner.advanceRun).toHaveBeenLastCalledWith('healthy');
  });

  it('does nothing while another replica holds the lock', async () => {
    redisLock.withLock.mockResolvedValue(null);

    await service.reconcileStalledRuns();

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(workflowRunner.advanceRun).not.toHaveBeenCalled();
  });
});
