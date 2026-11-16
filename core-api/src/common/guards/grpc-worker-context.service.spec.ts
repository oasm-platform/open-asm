import { Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';
import { GrpcWorkerContext } from './grpc-worker-context.service';

const metadataWithToken = (token?: string): Metadata => {
  const metadata = new Metadata();
  if (token) metadata.set(WORKER_TOKEN_HEADER, token);
  return metadata;
};

describe('GrpcWorkerContext.requireWorker', () => {
  it('returns the worker the guard authenticated for the call token', () => {
    const context = new GrpcWorkerContext();
    const worker = { id: 'worker-a' } as WorkerInstance;
    context.setWorker('token-a', worker);

    expect(context.requireWorker(metadataWithToken('token-a'))).toBe(worker);
  });

  it('rejects a call without a worker token', () => {
    const context = new GrpcWorkerContext();

    expect(() => context.requireWorker(metadataWithToken())).toThrow(
      RpcException,
    );
  });

  it('rejects a token the guard never authenticated', () => {
    const context = new GrpcWorkerContext();
    context.setWorker('token-a', { id: 'worker-a' } as WorkerInstance);

    expect(() => context.requireWorker(metadataWithToken('token-b'))).toThrow(
      RpcException,
    );
  });
});
