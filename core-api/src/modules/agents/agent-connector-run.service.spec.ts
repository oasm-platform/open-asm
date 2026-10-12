import { JobRunType, JobStatus } from '@/common/enums/enum';
import { AgentConnectorRunService } from './agent-connector-run.service';

describe('AgentConnectorRunService', () => {
  const order: string[] = [];
  let handler: ((ch: string, raw: string) => void) | undefined;
  const redis = {
    subscribe: jest.fn(async (_ch: string, h: (ch: string, raw: string) => void) => {
      order.push('subscribe');
      handler = h;
    }),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  };
  const tools = {
    getToolByNames: jest.fn().mockResolvedValue([{ id: 'tool-1' }]),
    getToolById: jest.fn().mockResolvedValue({ id: 'tool-1', isInstalled: true, priority: 3 }),
  };
  const jobs = [
    { id: 'j1', asset: { value: 'a.example.com' }, jobHistory: { id: 'jh-1' } },
    { id: 'j2', asset: { value: 'b.example.com' }, jobHistory: { id: 'jh-1' } },
  ];
  const registry = {
    createNewJob: jest.fn().mockResolvedValue(jobs),
    buildAgentGrpcJobs: jest.fn().mockResolvedValue([{ id: 'j1' }, { id: 'j2' }]),
    failAgentJobs: jest.fn().mockResolvedValue(0),
    cancelJobHistory: jest.fn().mockResolvedValue(undefined),
  };
  const streams = {
    resolveConversationWorker: jest.fn().mockResolvedValue('w1'),
    pushConnectorJob: jest.fn(() => {
      order.push('push');
      return true;
    }),
  };
  const input = {
    workspaceId: 'ws-1',
    conversationId: 'c1',
    slug: 'nuclei',
    targetIds: ['t1'],
    assetIds: [],
    toolCallId: 'call-1',
  };
  const done = (jobId: string, status: JobStatus, extra: object = {}) =>
    handler!('agent-job:done:jh-1', JSON.stringify({ jobId, status, ...extra }));
  let service: AgentConnectorRunService;

  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    handler = undefined;
    registry.createNewJob.mockResolvedValue(jobs);
    streams.resolveConversationWorker.mockResolvedValue('w1');
    streams.pushConnectorJob.mockImplementation(() => {
      order.push('push');
      return true;
    });
    service = new AgentConnectorRunService(
      tools as any,
      registry as any,
      streams as any,
      redis as any,
    );
  });

  it('returns an error and creates nothing when no worker serves the workspace', async () => {
    streams.resolveConversationWorker.mockResolvedValue(null);

    const result = await service.run(input);

    expect(result).toEqual({ error: expect.stringContaining('No worker') });
    expect(registry.createNewJob).not.toHaveBeenCalled();
  });

  it('creates agent jobs on the worker, subscribes before pushing, and aggregates results', async () => {
    const pending = service.run(input);
    await new Promise((r) => setImmediate(r));
    done('j1', JobStatus.COMPLETED, { excerpt: '{"ports":[443]}' });
    done('j2', JobStatus.FAILED, { error: 'boom' });

    const result: any = await pending;

    expect(registry.createNewJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobRunType: JobRunType.AGENT,
        assignWorkerId: 'w1',
        maxJobs: 20,
      }),
    );
    expect(order).toEqual(['subscribe', 'push', 'push']);
    expect(result.status).toBe('partial');
    expect(result.jobs).toEqual([
      expect.objectContaining({ jobId: 'j1', asset: 'a.example.com', status: JobStatus.COMPLETED, excerpt: '{"ports":[443]}' }),
      expect.objectContaining({ jobId: 'j2', status: JobStatus.FAILED, error: 'boom' }),
    ]);
    expect(redis.unsubscribe).toHaveBeenCalledWith('agent-job:done:jh-1');
  });

  it('ignores outcomes of jobs that belong to another call', async () => {
    const pending = service.run(input, 50);
    await new Promise((r) => setImmediate(r));
    done('other-job', JobStatus.COMPLETED);
    done('j1', JobStatus.COMPLETED);

    const result: any = await pending;

    expect(result.status).toBe('running');
    expect(result.jobs.map((j: any) => j.jobId)).toEqual(['j1', 'j2']);
  });

  it('returns running on timeout with the jobs finished so far', async () => {
    const pending = service.run(input, 30);
    await new Promise((r) => setImmediate(r));
    done('j1', JobStatus.COMPLETED);

    const result: any = await pending;

    expect(result.status).toBe('running');
    expect(result.jobs[1].status).toBe('running');
  });

  it('cancels the run when the user aborts', async () => {
    const controller = new AbortController();
    const pending = service.run({ ...input, abortSignal: controller.signal });
    await new Promise((r) => setImmediate(r));
    controller.abort();

    await expect(pending).resolves.toEqual({ error: 'Cancelled by user' });
    expect(registry.cancelJobHistory).toHaveBeenCalledWith('ws-1', 'jh-1');
  });

  it('fails the unpushed jobs when the stream closes mid-dispatch', async () => {
    streams.pushConnectorJob.mockImplementationOnce(() => true).mockImplementationOnce(() => false);
    const pending = service.run(input);
    await new Promise((r) => setImmediate(r));
    done('j1', JobStatus.COMPLETED);
    done('j2', JobStatus.FAILED, { error: 'worker stream closed before dispatch' });

    const result: any = await pending;

    expect(registry.failAgentJobs).toHaveBeenCalledWith({ jobIds: ['j2'] }, 'worker stream closed before dispatch');
    expect(result.status).toBe('partial');
  });

  it('returns at once when the target has no matching assets', async () => {
    registry.createNewJob.mockResolvedValue([]);

    await expect(service.run(input)).resolves.toEqual({
      error: expect.stringContaining('No matching assets'),
    });
    expect(redis.subscribe).not.toHaveBeenCalled();
  });

  it('caps the total excerpt size at 32 KB', async () => {
    const pending = service.run(input);
    await new Promise((r) => setImmediate(r));
    done('j1', JobStatus.COMPLETED, { excerpt: 'a'.repeat(30 * 1024) });
    done('j2', JobStatus.COMPLETED, { excerpt: 'b'.repeat(8 * 1024) });

    const result: any = await pending;

    const total = result.jobs.reduce((n: number, j: any) => n + (j.excerpt?.length ?? 0), 0);
    expect(total).toBe(32 * 1024);
  });

  it('refuses a connector that is not installed in the workspace', async () => {
    tools.getToolById.mockResolvedValueOnce({ id: 'tool-1', isInstalled: false });

    await expect(service.run(input)).resolves.toEqual({
      error: expect.stringContaining('not installed'),
    });
    expect(registry.createNewJob).not.toHaveBeenCalled();
  });

  it('resolves the tool scoped to the workspace', async () => {
    const pending = service.run(input);
    await new Promise((r) => setImmediate(r));
    done('j1', JobStatus.COMPLETED);
    done('j2', JobStatus.COMPLETED);
    await pending;

    expect(tools.getToolById).toHaveBeenCalledWith('tool-1', 'ws-1');
  });

  it('returns the createNewJob error without subscribing', async () => {
    const msg = 'Too many jobs (21 > 20); narrow targetIds/assetIds';
    registry.createNewJob.mockRejectedValueOnce(new Error(msg));

    await expect(service.run(input)).resolves.toEqual({ error: msg });
    expect(redis.subscribe).not.toHaveBeenCalled();
  });

  it('fails the created jobs and returns an error when dispatch throws', async () => {
    redis.subscribe.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.run(input)).resolves.toEqual({
      error: expect.stringContaining('redis down'),
    });
    expect(registry.failAgentJobs).toHaveBeenCalledWith(
      { jobIds: ['j1', 'j2'] },
      expect.stringContaining('redis down'),
    );
  });
});
