import { WORKER_TOKEN_HEADER } from '@/common/constants/app.constants';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Metadata } from '@grpc/grpc-js';
import { Reflector } from '@nestjs/core';
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
