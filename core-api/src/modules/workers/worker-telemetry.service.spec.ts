import { RpcException } from '@nestjs/microservices';
import { WorkerTelemetryService } from './worker-telemetry.service';
import type { WorkerTelemetryStore } from './worker-telemetry.store';
import type { WorkerTelemetryRequest } from './worker-telemetry.types';

const validRequest = (): WorkerTelemetryRequest => ({
  schemaVersion: 1,
  instanceId: 'c34e67b4-8462-4c47-9b92-f53916a03f21',
  sequence: '42',
  observedAt: new Date('2026-09-24T08:29:59.980Z'),
  startedAt: new Date('2026-09-24T03:20:12.000Z'),
  uptimeSeconds: '18348',
  state: 'WORKER_RUNTIME_STATE_READY',
  version: '1.4.2',
  node: {
    hostname: 'worker-node-03',
    os: 'linux',
    arch: 'amd64',
    runMode: 'node',
    cpuCount: 8,
    cpuUsagePercent: 37.42,
    memoryUsedBytes: '6871947674',
    memoryTotalBytes: '17179869184',
  },
  jobs: { active: 1, maxConcurrency: 10 },
  containers: {
    supported: true,
    total: 2,
    active: 1,
    idle: 1,
    unhealthy: 0,
    truncated: false,
    items: [
      {
        containerId: 'container-1',
        containerName: 'oasm-nmap-a91c',
        image: 'ghcr.io/oasm/nmap:latest',
        imageVersion: '1.4.2',
        tool: 'nmap',
        poolKey: 'ghcr.io/oasm/nmap:latest',
        pooled: true,
        runtimeState: 'CONTAINER_RUNTIME_STATE_RUNNING',
        healthState: 'CONTAINER_HEALTH_STATE_HEALTHY',
        executionState: 'CONTAINER_EXECUTION_STATE_ACTIVE',
        connectorConnected: true,
        oomKilled: false,
        cpuLimitMillicores: 1000,
        memoryLimitBytes: '1073741824',
        inspectionSucceeded: true,
      },
      {
        containerId: 'container-2',
        containerName: 'oasm-naabu-73bf',
        image: 'ghcr.io/oasm/naabu:latest',
        imageVersion: '1.2.0',
        tool: 'naabu',
        poolKey: 'ghcr.io/oasm/naabu:latest',
        pooled: true,
        runtimeState: 'CONTAINER_RUNTIME_STATE_RUNNING',
        healthState: 'CONTAINER_HEALTH_STATE_HEALTHY',
        executionState: 'CONTAINER_EXECUTION_STATE_NONE',
        connectorConnected: true,
        oomKilled: false,
        cpuLimitMillicores: 500,
        memoryLimitBytes: '536870912',
        inspectionSucceeded: true,
      },
    ],
  },
});

describe('WorkerTelemetryService', () => {
  const worker = { id: 'worker-1' } as never;
  let store: jest.Mocked<WorkerTelemetryStore>;
  let service: WorkerTelemetryService;
  const now = new Date('2026-09-24T08:30:00.000Z');

  beforeEach(() => {
    store = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
    };
    service = new WorkerTelemetryService(store);
  });

  it('normalizes an authenticated report and acknowledges it', async () => {
    const response = await service.record(worker, validRequest(), now);

    expect(response).toEqual({
      acceptedSequence: '42',
      receivedAt: now.toISOString(),
      workerId: 'worker-1',
      nextReportAfterMs: 10_000,
    });
    expect(store.write).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        workerId: 'worker-1',
        instanceId: 'c34e67b4-8462-4c47-9b92-f53916a03f21',
        receivedAt: now.toISOString(),
        state: 'READY',
        containers: expect.objectContaining({
          total: 2,
          active: 1,
          idle: 1,
          items: expect.arrayContaining([
            expect.objectContaining({
              containerId: 'container-1',
              runtimeState: 'RUNNING',
              healthState: 'HEALTHY',
              executionState: 'ACTIVE',
            }),
          ]),
        }),
      }),
    );
  });

  it('accepts protobuf timestamp objects emitted by the Nest gRPC loader', async () => {
    const request = validRequest();
    request.observedAt = { seconds: '1790238599', nanos: 980_000_000 };

    await expect(service.record(worker, request, now)).resolves.toEqual(
      expect.objectContaining({ acceptedSequence: '42' }),
    );
  });

  it.each([
    ['unknown worker state', { state: 'WORKER_RUNTIME_STATE_HACKED' }],
    ['non-finite CPU', { node: { ...validRequest().node, cpuUsagePercent: Number.NaN } }],
    ['CPU above 100', { node: { ...validRequest().node, cpuUsagePercent: 101 } }],
  ])('rejects %s', async (_label, patch) => {
    await expect(
      service.record(worker, { ...validRequest(), ...patch }, now),
    ).rejects.toBeInstanceOf(RpcException);
    expect(store.write).not.toHaveBeenCalled();
  });

  it('rejects more than 500 container items', async () => {
    const request = validRequest();
    request.containers.items = Array.from({ length: 501 }, (_, index) => ({
      ...request.containers.items[0],
      containerId: `container-${index}`,
    }));

    await expect(service.record(worker, request, now)).rejects.toBeInstanceOf(
      RpcException,
    );
    expect(store.write).not.toHaveBeenCalled();
  });

  it('maps Redis write failures to an unavailable RPC error', async () => {
    store.write.mockRejectedValue(new Error('redis down'));

    await expect(service.record(worker, validRequest(), now)).rejects.toBeInstanceOf(
      RpcException,
    );
  });

  it('returns the stored snapshot unchanged', async () => {
    const snapshot = { workerId: 'worker-1', state: 'READY' } as never;
    store.read.mockResolvedValue(snapshot);

    await expect(service.get('worker-1', now)).resolves.toBe(snapshot);
    expect(store.read).toHaveBeenCalledWith('worker-1', now);
  });
});
