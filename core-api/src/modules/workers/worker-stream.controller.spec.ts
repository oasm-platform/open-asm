import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkerInstance } from './entities/worker.entity';
import { WorkerStreamController } from './worker-stream.controller';
import { WorkerStreamRegistry } from './worker-stream-registry.service';

describe('WorkerStreamController', () => {
  const TOKEN = 'worker-token-value';

  let controller: WorkerStreamController;
  let registry: {
    register: jest.Mock;
    unregister: jest.Mock;
  };
  let findWorker: jest.Mock;

  const metadataWithToken = () => {
    const metadata = new Metadata();
    metadata.set('worker-token', TOKEN);
    return metadata;
  };

  const validWorker = { id: 'worker-1', token: TOKEN } as WorkerInstance;

  beforeEach(async () => {
    registry = { register: jest.fn(), unregister: jest.fn() };
    findWorker = jest.fn().mockResolvedValue(validWorker);

    const module = await Test.createTestingModule({
      controllers: [WorkerStreamController],
      providers: [
        { provide: WorkerStreamRegistry, useValue: registry },
        { provide: getRepositoryToken(WorkerInstance), useValue: { findOne: findWorker } },
      ],
    }).compile();

    controller = module.get(WorkerStreamController);
  });

  it('rejects a stream without a valid worker token', async () => {
    const outbound$ = controller.connect(of({}), new Metadata());

    await expect(firstValueFrom(outbound$)).rejects.toThrow(
      'Invalid worker token',
    );
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('answers the register handshake and tracks the stream', async () => {
    const inbound$ = new Subject<Record<string, unknown>>();
    const outbound$ = controller.connect(inbound$, metadataWithToken());

    const first = firstValueFrom(outbound$);
    // The register frame may be emitted before authentication resolves, so it is
    // queued and replayed — the response must still arrive.
    inbound$.next({ register: { apiKey: 'k' } });
    inbound$.next({ heartbeat: { sequence: 1 } });

    expect(await first).toEqual({
      registerResp: expect.objectContaining({ workerId: 'worker-1', accepted: true }),
    });
    expect(registry.register).toHaveBeenCalledWith('worker-1', expect.anything());

    // The heartbeat that arrived before authentication is not lost.
    const acks: Record<string, unknown>[] = [];
    outbound$.subscribe((value) => acks.push(value));
    await Promise.resolve();
    expect(acks).toContainEqual({
      heartbeatAck: expect.objectContaining({ workerId: 'worker-1' }),
    });
  });

  it('unregisters the stream when the worker disconnects', async () => {
    const inbound$ = new Subject<Record<string, unknown>>();
    const outbound$ = controller.connect(inbound$, metadataWithToken());
    outbound$.subscribe({ error: () => undefined, complete: () => undefined });

    inbound$.next({ register: {} });
    await Promise.resolve();
    inbound$.complete();

    expect(registry.unregister).toHaveBeenCalledWith(
      'worker-1',
      expect.anything(),
    );
  });

  it('surfaces an authentication lookup failure to the stream', async () => {
    findWorker.mockRejectedValueOnce(new Error('db down'));
    const outbound$ = controller.connect(of({}), metadataWithToken());

    await expect(firstValueFrom(outbound$)).rejects.toThrow('db down');
  });

  it('fails the stream when the inbound source errors', async () => {
    const outbound$ = controller.connect(
      throwError(() => new Error('transport gone')),
      metadataWithToken(),
    );

    await expect(firstValueFrom(outbound$)).rejects.toThrow('transport gone');
  });
});
