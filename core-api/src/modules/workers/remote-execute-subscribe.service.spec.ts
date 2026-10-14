/* eslint-disable @typescript-eslint/no-unsafe-return */
import { WorkerScope } from '@/common/enums/enum';
import { RemoteExecuteSubscribeService } from './remote-execute-subscribe.service';

const worker = (id: string, workspaceId: string | null, scope: WorkerScope) =>
  ({
    id,
    workspaceId,
    scope,
    workspace: workspaceId ? { id: workspaceId } : null,
  }) as any;

describe('RemoteExecuteSubscribeService — agent worker scoping', () => {
  const workersService = {
    enableAgentMode: jest.fn().mockResolvedValue(undefined),
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

  const connect = (w: any) => {
    const reg = service.registerWorker(w);
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

  it('never resolves a cloud worker and never enables agent mode for it', async () => {
    connect(worker('w-cloud', null, WorkerScope.CLOUD));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(
      service.pickConversationWorker('c1', 'ws-1'),
    ).resolves.toBeNull();
    expect(workersService.enableAgentMode).not.toHaveBeenCalled();
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

  it('clears a pre-existing cloud pin and uses a workspace worker', async () => {
    connect(worker('w-cloud', null, WorkerScope.CLOUD));
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    redis.get.mockResolvedValue('w-cloud');
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-cloud',
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

  it('clears an out-of-scope (cloud/foreign) pin to NULL when no fallback exists', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'c1',
      workerId: 'w-cloud',
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
});
