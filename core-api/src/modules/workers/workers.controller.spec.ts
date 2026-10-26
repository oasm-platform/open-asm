import {
  AGENT_SANDBOX_HEADER,
  REMOTE_EXECUTE_KEEPALIVE_HEADER,
  WORKER_TOKEN_HEADER,
} from '@/common/constants/app.constants';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Role, WorkerScope, WorkerType } from '@/common/enums/enum';
import type { UserContextPayload } from '@/common/interfaces/app.interface';
import { Metadata } from '@grpc/grpc-js';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { GetManyWorkersDto } from './dto/workers.dto';
import { RemoteExecuteSubscribeService } from './remote-execute-subscribe.service';
import { WorkersController } from './workers.controller';

describe('WorkersController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getWorkers', 'GET /', ['worker.read']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (WorkersController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      WorkersController,
    ]);
    expect(required).toEqual(keys);
  });
});

describe('WorkersController global worker access', () => {
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  const query = { page: 1, limit: 10 } as GetManyWorkersDto;
  const admin = { role: Role.ADMIN } as UserContextPayload;
  const member = { role: Role.USER } as UserContextPayload;

  const setup = () => {
    const workersService = {
      getWorkerList: jest.fn().mockResolvedValue({ data: [] }),
      getWorkerById: jest.fn().mockResolvedValue({}),
    };
    const controller = new WorkersController(
      workersService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, workersService };
  };

  it('rejects a non-admin asking for global workers', () => {
    const { controller, workersService } = setup();

    expect(() =>
      controller.getWorkers(
        { ...query, scope: WorkerScope.CLOUD },
        workspaceId,
        member,
      ),
    ).toThrow(ForbiddenException);
    expect(workersService.getWorkerList).not.toHaveBeenCalled();
  });

  it("pins a non-admin's list to their own workspace", async () => {
    const { controller, workersService } = setup();

    await controller.getWorkers(
      {
        ...query,
        workspaceId: '33333333-3333-4333-8333-333333333333',
        enabledAgentMode: true,
      },
      workspaceId,
      member,
    );

    expect(workersService.getWorkerList).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        scope: WorkerScope.WORKSPACE,
      }),
    );
  });

  it('lets an admin list global workers', async () => {
    const { controller, workersService } = setup();

    await controller.getWorkers(
      { ...query, scope: WorkerScope.CLOUD },
      workspaceId,
      admin,
    );

    expect(workersService.getWorkerList).toHaveBeenCalledWith(
      expect.objectContaining({ scope: WorkerScope.CLOUD }),
    );
  });

  it.each([
    [admin, true],
    [member, false],
  ])('reads a worker with canReadGlobal for %j', async (user, expected) => {
    const { controller, workersService } = setup();

    await controller.getWorkerById('w-1', workspaceId, user);

    expect(workersService.getWorkerById).toHaveBeenCalledWith(
      'w-1',
      workspaceId,
      expected,
    );
  });
});

describe('WorkersController.grpcGetManifest', () => {
  it('returns an empty initCommands array (nuclei template updates temporarily disabled)', () => {
    const controller = new WorkersController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(controller.grpcGetManifest()).toEqual({ initCommands: [] });
  });
});

describe('WorkersController.grpcWorkerTelemetry', () => {
  it('authenticates metadata and records telemetry for the resolved worker', async () => {
    const worker = { id: 'worker-1', token: 'secret-token' };
    const telemetryService = {
      record: jest.fn().mockResolvedValue({
        acceptedSequence: '42',
        receivedAt: '2026-09-24T08:30:00.000Z',
        workerId: worker.id,
        nextReportAfterMs: 10_000,
      }),
    };
    const workerContext = {
      getWorker: jest.fn().mockReturnValue(worker),
    };
    const controller = new WorkersController(
      {} as never,
      {} as never,
      workerContext as never,
      {} as never,
      telemetryService as never,
    );
    const metadata = new Metadata();
    metadata.set(WORKER_TOKEN_HEADER, worker.token);
    const request = {
      schemaVersion: 1,
      instanceId: 'instance-1',
      sequence: '42',
      state: 'WORKER_RUNTIME_STATE_READY',
    };

    await expect(
      controller.grpcWorkerTelemetry(request, metadata),
    ).resolves.toEqual({
      acceptedSequence: '42',
      receivedAt: { seconds: '1790238600', nanos: 0 },
      workerId: worker.id,
      nextReportAfterMs: 10_000,
    });
    expect(workerContext.getWorker).toHaveBeenCalledWith(worker.token);
    expect(telemetryService.record).toHaveBeenCalledWith(worker, request);
  });
});

describe('WorkersController remote execute', () => {
  const ownWorker = {
    id: 'w-own',
    token: 'token-own',
    workspaceId: 'ws-1',
    scope: WorkerScope.WORKSPACE,
    type: WorkerType.BUILT_IN,
  };
  const otherWorker = {
    id: 'w-other',
    token: 'token-other',
    workspaceId: 'ws-2',
    scope: WorkerScope.WORKSPACE,
    type: WorkerType.BUILT_IN,
  };
  const workers: Record<string, unknown> = {
    [ownWorker.token]: ownWorker,
    [otherWorker.token]: otherWorker,
  };

  const metadataFor = (token: string, extra: Record<string, string> = {}) => {
    const metadata = new Metadata();
    metadata.set(WORKER_TOKEN_HEADER, token);
    for (const [key, value] of Object.entries(extra)) metadata.set(key, value);
    return metadata;
  };

  const build = () => {
    const workersService = {
      enableAgentMode: jest.fn().mockResolvedValue(undefined),
      setAgentMode: jest.fn().mockResolvedValue(undefined),
      handleRemoteExecuteResult: jest.fn().mockResolvedValue(undefined),
    };
    const subscribeService = new RemoteExecuteSubscribeService(
      workersService as never,
      {} as never,
      { publish: jest.fn().mockResolvedValue(1) } as never,
    );
    const workerContext = {
      getWorker: jest.fn((token: string) => workers[token]),
    };
    const controller = new WorkersController(
      workersService as never,
      subscribeService,
      workerContext as never,
      {} as never,
      {} as never,
    );
    return { controller, subscribeService, workersService };
  };

  const result = (sessionId: string) => ({
    id: 'r1',
    sessionId,
    type: 1,
    data: Buffer.from('out'),
    exitCode: 0,
  });

  it('registers the subscribing worker with its sandbox and keepalive headers', () => {
    const { controller, subscribeService } = build();
    const register = jest.spyOn(subscribeService, 'registerWorker');

    const own = controller
      .grpcRemoteExecuteSubscribe(
        {},
        metadataFor(ownWorker.token, {
          [AGENT_SANDBOX_HEADER]: '1',
          [REMOTE_EXECUTE_KEEPALIVE_HEADER]: '1',
        }),
      )
      .subscribe();
    controller
      .grpcRemoteExecuteSubscribe({}, metadataFor(otherWorker.token))
      .subscribe();

    expect(register).toHaveBeenNthCalledWith(1, ownWorker, {
      sandboxed: true,
      keepalive: true,
    });
    expect(register).toHaveBeenNthCalledWith(2, otherWorker, {
      sandboxed: false,
      keepalive: false,
    });
    // stops the keepalive interval
    own.unsubscribe();
  });

  it('drops a result from a worker the session was not assigned to', async () => {
    const { controller, subscribeService, workersService } = build();
    controller
      .grpcRemoteExecuteSubscribe({}, metadataFor(ownWorker.token))
      .subscribe();
    subscribeService.pushCommand(ownWorker.id, 's1', 'id');

    await expect(
      controller.grpcRemoteExecuteResult(
        result('s1'),
        metadataFor(otherWorker.token),
      ),
    ).resolves.toMatchObject({ success: false });
    expect(workersService.handleRemoteExecuteResult).not.toHaveBeenCalled();

    await expect(
      controller.grpcRemoteExecuteResult(
        result('s1'),
        metadataFor(ownWorker.token),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(workersService.handleRemoteExecuteResult).toHaveBeenCalledTimes(1);
  });

  it('accepts a result for a session with no recorded push', async () => {
    const { controller, workersService } = build();

    await expect(
      controller.grpcRemoteExecuteResult(
        result('s-unknown'),
        metadataFor(otherWorker.token),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(workersService.handleRemoteExecuteResult).toHaveBeenCalledTimes(1);
  });
});

describe('WorkersController.grpcJoin', () => {
  const originalTrustedProxies = process.env.TRUSTED_PROXIES;
  afterEach(() => {
    if (originalTrustedProxies === undefined) delete process.env.TRUSTED_PROXIES;
    else process.env.TRUSTED_PROXIES = originalTrustedProxies;
  });

  const join = async (peer: string, forwardedFor?: string) => {
    const workersService = {
      join: jest.fn().mockResolvedValue({ id: 'w-1', token: 't-1' }),
    };
    const controller = new WorkersController(
      workersService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const metadata = new Metadata();
    if (forwardedFor) metadata.set('x-forwarded-for', forwardedFor);

    await controller.grpcJoin({ apiKey: 'key' }, metadata, {
      getPeer: () => peer,
    });
    return (workersService.join.mock.calls[0][0] as { ipAddress?: string })
      .ipAddress;
  };

  it('stores the direct peer address without its port', async () => {
    delete process.env.TRUSTED_PROXIES;
    await expect(join('203.0.113.7:51234')).resolves.toBe('203.0.113.7');
    await expect(join('[2001:db8::1]:51234')).resolves.toBe('2001:db8::1');
  });

  it('ignores X-Forwarded-For unless the peer is a trusted proxy', async () => {
    delete process.env.TRUSTED_PROXIES;
    await expect(join('172.19.0.5:443', '203.0.113.7')).resolves.toBe(
      '172.19.0.5',
    );
  });

  it('takes the worker address forwarded by a trusted proxy', async () => {
    process.env.TRUSTED_PROXIES = '172.16.0.0/12';
    await expect(
      join('172.19.0.5:443', '203.0.113.7, 172.19.0.7'),
    ).resolves.toBe('203.0.113.7');
  });
});
