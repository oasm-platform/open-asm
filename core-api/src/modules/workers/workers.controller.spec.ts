import {
  AGENT_SANDBOX_HEADER,
  WORKER_TOKEN_HEADER,
} from '@/common/constants/app.constants';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { Metadata } from '@grpc/grpc-js';
import { Reflector } from '@nestjs/core';
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

  it('registers the subscribing worker with its agent sandbox header', () => {
    const { controller, subscribeService } = build();
    const register = jest.spyOn(subscribeService, 'registerWorker');

    controller
      .grpcRemoteExecuteSubscribe(
        {},
        metadataFor(ownWorker.token, { [AGENT_SANDBOX_HEADER]: '1' }),
      )
      .subscribe();
    controller
      .grpcRemoteExecuteSubscribe({}, metadataFor(otherWorker.token))
      .subscribe();

    expect(register).toHaveBeenNthCalledWith(1, ownWorker, { sandboxed: true });
    expect(register).toHaveBeenNthCalledWith(2, otherWorker, {
      sandboxed: false,
    });
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
