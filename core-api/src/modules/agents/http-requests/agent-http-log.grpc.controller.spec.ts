import type { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { Metadata } from '@grpc/grpc-js';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import type {
  AgentHttpIngestService,
  EgressHttpLogInput,
} from './agent-http-ingest.service';
import { AgentHttpLogGrpcController } from './agent-http-log.grpc.controller';

const worker = { id: 'worker-1' } as WorkerInstance;

function setup() {
  const ingest = jest.fn().mockResolvedValue({ accepted: 3, rejected: 1 });
  const requireWorker = jest.fn().mockReturnValue(worker);
  const controller = new AgentHttpLogGrpcController(
    { ingest } as unknown as AgentHttpIngestService,
    { requireWorker } as unknown as GrpcWorkerContext,
  );
  return { controller, ingest, requireWorker };
}

const logs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }) as EgressHttpLogInput);

describe('AgentHttpLogGrpcController', () => {
  it('is guarded by the worker token', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AgentHttpLogGrpcController.prototype.reportEgressHttpLogs,
    ) as unknown[];
    expect(guards).toContain(GrpcWorkerTokenGuard);
  });

  it('resolves the worker from metadata and forwards the batch', async () => {
    const { controller, ingest, requireWorker } = setup();
    const metadata = new Metadata();
    const batch = logs(4);

    const ack = await controller.reportEgressHttpLogs(
      { logs: batch, dropped: '5' },
      metadata,
    );

    expect(requireWorker).toHaveBeenCalledWith(metadata);
    expect(ingest).toHaveBeenCalledWith('worker-1', batch, 5);
    expect(ack).toEqual({ accepted: 3, rejected: 1 });
  });

  it('ingests at most 1,000 logs and counts the rest rejected', async () => {
    const { controller, ingest } = setup();

    const ack = await controller.reportEgressHttpLogs(
      { logs: logs(1_005), dropped: '0' },
      new Metadata(),
    );

    expect((ingest.mock.calls[0] as unknown[])[1]).toHaveLength(1_000);
    expect(ack).toEqual({ accepted: 3, rejected: 6 });
  });

  it('treats a missing log list and dropped count as empty', async () => {
    const { controller, ingest } = setup();
    await controller.reportEgressHttpLogs({}, new Metadata());
    expect(ingest).toHaveBeenCalledWith('worker-1', [], 0);
  });
});
