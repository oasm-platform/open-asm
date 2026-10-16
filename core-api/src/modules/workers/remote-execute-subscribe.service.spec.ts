/* eslint-disable @typescript-eslint/no-unsafe-return */
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { RemoteExecuteSubscribeService } from './remote-execute-subscribe.service';

const worker = (
  id: string,
  workspaceId: string | null,
  scope: WorkerScope,
  type: WorkerType = WorkerType.BUILT_IN,
) =>
  ({
    id,
    workspaceId,
    scope,
    type,
    workspace: workspaceId ? { id: workspaceId } : null,
  }) as any;

/** A global worker: cloud scope + built-in, as createCloudWorker makes it. */
const globalWorker = (id: string) => worker(id, null, WorkerScope.CLOUD);

describe('RemoteExecuteSubscribeService — agent worker scoping', () => {
  const workersService = {
    enableAgentMode: jest.fn().mockResolvedValue(undefined),
    setAgentMode: jest.fn().mockResolvedValue(undefined),
    isAgentWorkerForWorkspace: jest.fn().mockResolvedValue(false),
  };
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
  const conversationRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
  };
  let service: RemoteExecuteSubscribeService;

  const connect = (w: any, options: { sandboxed?: boolean } = {}) => {
    const reg = service.registerWorker(w, options);
    const seen: any[] = [];
    reg.observable.subscribe((e) => seen.push(e));
    return seen;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
    service = new RemoteExecuteSubscribeService(
      workersService as any,
      conversationRepo as any,
      redis as any,
    );
  });

  it('never resolves a worker of another workspace', async () => {
    connect(worker('w-other', 'ws-2', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(
      service.pickConversationWorker('c1', 'ws-1'),
    ).resolves.toBeNull();
  });

  it('serves any workspace from a sandboxed global worker and enables agent mode for it', async () => {
    connect(globalWorker('w-cloud'), { sandboxed: true });
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-cloud', pin: true },
    );
    await expect(service.pickConversationWorker('c1', 'ws-2')).resolves.toEqual(
      { workerId: 'w-cloud', pin: true },
    );
    expect(workersService.enableAgentMode).toHaveBeenCalledWith('w-cloud');
  });

  it("prefers the workspace's own worker over a global one", async () => {
    connect(globalWorker('w-cloud'), { sandboxed: true });
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-own', pin: true },
    );
    // Another workspace only has the global one
    await expect(service.pickConversationWorker('c1', 'ws-2')).resolves.toEqual(
      { workerId: 'w-cloud', pin: true },
    );
  });

  it('falls back to a connected worker of the same workspace, pinned only after the push', async () => {
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-own', pin: true },
    );
    // Picking persists nothing: a failed push must not pin a dead worker.
    expect(qb.execute).not.toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();

    await service.pinConversationWorker('c1', 'w-own');
    expect(qb.set).toHaveBeenCalledWith({ workerId: 'w-own' });
    expect(redis.setex).toHaveBeenCalledWith(
      'agent:conv:worker:c1',
      expect.any(Number),
      'w-own',
    );
  });

  it('pushCommandWithConversation does not pin when the push fails', async () => {
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });
    jest.spyOn(service, 'pushCommand').mockReturnValue(null);

    await expect(
      service.pushCommandWithConversation('c1', 'ws-1', 's1', 'id'),
    ).resolves.toBeNull();
    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('keeps an in-scope offline pin and serves this push from a fallback', async () => {
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-chosen',
    });
    workersService.isAgentWorkerForWorkspace.mockResolvedValue(true);

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-own', pin: false },
    );
    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('keeps a pinned global worker', async () => {
    connect(globalWorker('w-cloud'), { sandboxed: true });
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    redis.get.mockResolvedValue('w-cloud');

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-cloud', pin: false },
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("clears a pre-existing pin to another workspace's worker and uses its own", async () => {
    connect(worker('w-foreign', 'ws-2', WorkerScope.WORKSPACE));
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    redis.get.mockResolvedValue('w-foreign');
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-foreign',
    });
    workersService.isAgentWorkerForWorkspace.mockResolvedValue(false);

    await expect(service.pickConversationWorker('c1', 'ws-1')).resolves.toEqual(
      { workerId: 'w-own', pin: true },
    );
    expect(redis.del).toHaveBeenCalledWith('agent:conv:worker:c1');
  });

  it('keeps an in-scope pin whose worker is offline, with no fallback', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-offline',
    });
    workersService.isAgentWorkerForWorkspace.mockResolvedValue(true);

    await expect(
      service.pickConversationWorker('c1', 'ws-1'),
    ).resolves.toBeNull();
    expect(workersService.isAgentWorkerForWorkspace).toHaveBeenCalledWith(
      'w-offline',
      'ws-1',
    );
    expect(qb.set).not.toHaveBeenCalled();
    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('clears an out-of-scope (foreign) pin to NULL when no fallback exists', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-foreign',
    });
    workersService.isAgentWorkerForWorkspace.mockResolvedValue(false);

    await expect(
      service.pickConversationWorker('c1', 'ws-1'),
    ).resolves.toBeNull();
    expect(qb.set).toHaveBeenCalledWith({ workerId: null });
    expect(qb.execute).toHaveBeenCalled();
  });

  it('pushToolRun emits a RUN_TOOL event carrying the tool run', () => {
    const seen = connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    const toolRun = {
      tool: 'nmap',
      image: 'img',
      target: 'example.com',
      configJson: '',
    };

    expect(service.pushToolRun('w-own', 'call-1', toolRun)).toMatchObject({
      type: 3,
      sessionId: 'call-1',
      toolRun,
    });
    expect(seen.at(-1)).toMatchObject({ type: 3, toolRun });
    expect(service.pushToolRun('w-gone', 'call-1', toolRun)).toBeNull();
  });

  it('pushCancelToolRun emits a CANCEL_TOOL event for the session', () => {
    const seen = connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    service.pushCancelToolRun('w-own', 'call-1');
    expect(seen.at(-1)).toMatchObject({ type: 4, sessionId: 'call-1' });
  });

  it('fails an in-flight tool run at once when its worker disconnects', () => {
    const reg = service.registerWorker(
      worker('w-own', 'ws-1', WorkerScope.WORKSPACE),
    );
    const sub = reg.observable.subscribe();
    service.pushToolRun('w-own', 'call-1', {
      tool: 'nmap',
      image: 'img',
      target: 'example.com',
      configJson: '',
    });
    service.pushToolRun('w-own', 'call-done', {
      tool: 'nmap',
      image: 'img',
      target: 'example.com',
      configJson: '',
    });
    service.removeSession('call-done');

    sub.unsubscribe();

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = redis.publish.mock.calls[0] as [string, string];
    expect(channel).toBe('remote-execute:results:call-1');
    expect(JSON.parse(raw)).toMatchObject({ sessionId: 'call-1', type: 4 });
  });

  describe('global workers', () => {
    it('never serves agents from a cloud PROVIDER worker, sandboxed or not', async () => {
      connect(
        worker('w-provider', null, WorkerScope.CLOUD, WorkerType.PROVIDER),
        { sandboxed: true },
      );
      conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

      await expect(
        service.pickConversationWorker('c1', 'ws-1'),
      ).resolves.toBeNull();
      expect(service.pushCommandWithSession('s1', 'id', 'ws-1')).toBeNull();
      expect(workersService.enableAgentMode).not.toHaveBeenCalled();
      expect(workersService.setAgentMode).toHaveBeenCalledWith(
        'w-provider',
        false,
      );
    });

    it('never serves agents from an unsandboxed global worker and disables its agent mode', async () => {
      connect(globalWorker('w-cloud'));
      conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

      await expect(
        service.pickConversationWorker('c1', 'ws-1'),
      ).resolves.toBeNull();
      expect(service.pushCommandWithSession('s1', 'id', 'ws-1')).toBeNull();
      expect(workersService.enableAgentMode).not.toHaveBeenCalled();
      expect(workersService.setAgentMode).toHaveBeenCalledWith(
        'w-cloud',
        false,
      );
    });

    it('drops a cached pin to an unsandboxed global worker', async () => {
      connect(globalWorker('w-cloud'));
      connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
      redis.get.mockResolvedValue('w-cloud');
      conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

      await expect(
        service.pickConversationWorker('c1', 'ws-1'),
      ).resolves.toEqual({ workerId: 'w-own', pin: true });
      expect(redis.del).toHaveBeenCalledWith('agent:conv:worker:c1');
    });

    it('serves every workspace from a sandboxed global worker', () => {
      const seen = connect(globalWorker('w-cloud'), { sandboxed: true });

      expect(service.pushCommandWithSession('s1', 'id', 'ws-1')).toMatchObject({
        workerId: 'w-cloud',
        sessionId: 's1',
      });
      expect(service.pushCommandWithSession('s2', 'id', 'ws-2')).toMatchObject({
        workerId: 'w-cloud',
        sessionId: 's2',
      });
      expect(seen.filter((e) => e.type === 2)).toHaveLength(2);
      expect(workersService.enableAgentMode).toHaveBeenCalledWith('w-cloud');
      expect(workersService.setAgentMode).not.toHaveBeenCalled();
    });

    it('enables agent mode for a workspace worker without the sandbox header', () => {
      connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));

      expect(workersService.enableAgentMode).toHaveBeenCalledWith('w-own');
      expect(service.pushCommandWithSession('s1', 'id', 'ws-1')).toMatchObject({
        workerId: 'w-own',
      });
    });
  });

  describe('result origin', () => {
    const toolRun = {
      tool: 'nmap',
      image: 'img',
      target: 'example.com',
      configJson: '',
    };

    it('accepts results for a session only from the worker it was pushed to', () => {
      connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
      connect(worker('w-other', 'ws-2', WorkerScope.WORKSPACE));

      service.pushCommand('w-own', 's1', 'id');
      expect(service.isResultFromAssignedWorker('s1', 'w-own')).toBe(true);
      expect(service.isResultFromAssignedWorker('s1', 'w-other')).toBe(false);
    });

    it('tracks the assignment on every push path', async () => {
      connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
      connect(worker('w-other', 'ws-2', WorkerScope.WORKSPACE));
      conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

      service.pushCommandWithSession('s-session', 'id', 'ws-1');
      await service.pushCommandWithConversation('c1', 'ws-1', 's-conv', 'id');
      await service.pushCommandWithConversation('', 'ws-1', 's-noconv', 'id');
      service.pushToolRun('w-own', 's-tool', toolRun);

      for (const sessionId of ['s-session', 's-conv', 's-noconv', 's-tool']) {
        expect(service.isResultFromAssignedWorker(sessionId, 'w-own')).toBe(
          true,
        );
        expect(service.isResultFromAssignedWorker(sessionId, 'w-other')).toBe(
          false,
        );
      }
    });

    it('accepts results for unknown sessions, removed sessions and after the worker disconnects', () => {
      const reg = service.registerWorker(
        worker('w-own', 'ws-1', WorkerScope.WORKSPACE),
      );
      const sub = reg.observable.subscribe();
      expect(service.isResultFromAssignedWorker('s-unknown', 'w-x')).toBe(true);

      service.pushCommand('w-own', 's-done', 'id');
      service.removeSession('s-done');
      expect(service.isResultFromAssignedWorker('s-done', 'w-x')).toBe(true);

      service.pushToolRun('w-own', 's-run', toolRun);
      expect(service.isResultFromAssignedWorker('s-run', 'w-x')).toBe(false);
      sub.unsubscribe();
      expect(service.isResultFromAssignedWorker('s-run', 'w-x')).toBe(true);
    });

    it('follows the session to its new worker after a reassignment', () => {
      connect(worker('w-a', 'ws-1', WorkerScope.WORKSPACE));
      connect(worker('w-b', 'ws-1', WorkerScope.WORKSPACE));

      service.pushCommand('w-a', 's1', 'id');
      service.pushCommand('w-b', 's1', 'id');
      expect(service.isResultFromAssignedWorker('s1', 'w-a')).toBe(false);
      expect(service.isResultFromAssignedWorker('s1', 'w-b')).toBe(true);
    });
  });
});
