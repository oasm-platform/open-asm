import { WorkerScope } from '@/common/enums/enum';
import { RemoteExecuteSubscribeService } from './remote-execute-subscribe.service';

const worker = (id: string, workspaceId: string | null, scope: WorkerScope) =>
  ({ id, workspaceId, scope, workspace: workspaceId ? { id: workspaceId } : null }) as any;

describe('RemoteExecuteSubscribeService — agent worker scoping', () => {
  const workersService = { enableAgentMode: jest.fn().mockResolvedValue(undefined) };
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

    await expect(service.resolveConversationWorker('c1', 'ws-1')).resolves.toBeNull();
  });

  it('never resolves a cloud worker and never enables agent mode for it', async () => {
    connect(worker('w-cloud', null, WorkerScope.CLOUD));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(service.resolveConversationWorker('c1', 'ws-1')).resolves.toBeNull();
    expect(workersService.enableAgentMode).not.toHaveBeenCalled();
  });

  it('falls back to a connected worker of the same workspace and pins it', async () => {
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: null });

    await expect(service.resolveConversationWorker('c1', 'ws-1')).resolves.toBe('w-own');
    expect(redis.setex).toHaveBeenCalledWith('agent:conv:worker:c1', expect.any(Number), 'w-own');
  });

  it('clears a pre-existing cloud pin and uses a workspace worker', async () => {
    connect(worker('w-cloud', null, WorkerScope.CLOUD));
    connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));
    redis.get.mockResolvedValue('w-cloud');
    conversationRepo.findOne.mockResolvedValue({ id: 'c1', workerId: 'w-cloud' });

    await expect(service.resolveConversationWorker('c1', 'ws-1')).resolves.toBe('w-own');
    expect(redis.del).toHaveBeenCalledWith('agent:conv:worker:c1');
    expect(qb.execute).toHaveBeenCalled(); // DB pin rewritten
  });

  it('pushConnectorJob emits a CONNECTOR_JOB event carrying the job', () => {
    const seen = connect(worker('w-own', 'ws-1', WorkerScope.WORKSPACE));

    expect(service.pushConnectorJob('w-own', 'call-1', { id: 'job-1' })).toBe(true);
    expect(seen.at(-1)).toMatchObject({ type: 3, sessionId: 'call-1', job: { id: 'job-1' } });
    expect(service.pushConnectorJob('w-gone', 'call-1', { id: 'job-1' })).toBe(false);
  });
});
