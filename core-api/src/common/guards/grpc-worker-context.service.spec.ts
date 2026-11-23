import { Metadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import {
  WORKER_TOKEN_CACHE_MS,
  WORKER_TOKEN_HEADER,
} from '../constants/app.constants';
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

describe('GrpcWorkerContext.getFresh', () => {
  let now: jest.SpyInstance;

  beforeEach(() => {
    now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    now.mockRestore();
  });

  it('serves a worker authenticated less than the cache window ago', () => {
    // Given
    const context = new GrpcWorkerContext();
    const worker = { id: 'worker-a' } as WorkerInstance;
    context.setWorker('token-a', worker);

    // When
    now.mockReturnValue(1_000_000 + WORKER_TOKEN_CACHE_MS - 1);

    // Then
    expect(context.getFresh('token-a')).toBe(worker);
  });

  it('forgets it once the cache window has passed', () => {
    // Given
    const context = new GrpcWorkerContext();
    context.setWorker('token-a', { id: 'worker-a' } as WorkerInstance);

    // When
    now.mockReturnValue(1_000_000 + WORKER_TOKEN_CACHE_MS);

    // Then: the guard must look the token up again
    expect(context.getFresh('token-a')).toBeUndefined();
  });

  it('drops long-expired tokens instead of keeping every token it ever saw', () => {
    // Given: a worker identity that stopped calling long ago
    const context = new GrpcWorkerContext();
    context.setWorker('token-gone', { id: 'gone' } as WorkerInstance);

    // When: another worker authenticates much later
    now.mockReturnValue(1_000_000 + 3 * WORKER_TOKEN_CACHE_MS);
    context.setWorker('token-b', { id: 'worker-b' } as WorkerInstance);

    // Then
    expect(context.size()).toBe(1);
    expect(() =>
      context.requireWorker(metadataWithToken('token-gone')),
    ).toThrow(RpcException);
  });

  it('keeps a token the handler of an in-flight call may still read', () => {
    // Given: a call authenticated just inside the window
    const context = new GrpcWorkerContext();
    const worker = { id: 'worker-a' } as WorkerInstance;
    context.setWorker('token-a', worker);

    // When: the window lapses while another call authenticates
    now.mockReturnValue(1_000_000 + WORKER_TOKEN_CACHE_MS + 1);
    context.setWorker('token-b', { id: 'worker-b' } as WorkerInstance);

    // Then
    expect(context.requireWorker(metadataWithToken('token-a'))).toBe(worker);
  });
});
