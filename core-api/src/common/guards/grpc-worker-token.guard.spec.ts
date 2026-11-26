import { Metadata } from '@grpc/grpc-js';
import type { ExecutionContext } from '@nestjs/common';
import type { WorkersService } from '@/modules/workers/workers.service';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';
import { GrpcWorkerContext } from './grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from './grpc-worker-token.guard';

const callWithToken = (token: string): ExecutionContext => {
  const metadata = new Metadata();
  metadata.set(WORKER_TOKEN_HEADER, token);
  return {
    switchToRpc: () => ({ getContext: () => metadata }),
  } as unknown as ExecutionContext;
};

describe('GrpcWorkerTokenGuard', () => {
  const worker = { id: 'worker-a' } as WorkerInstance;
  let validateWorkerToken: jest.Mock;
  let context: GrpcWorkerContext;
  let guard: GrpcWorkerTokenGuard;

  beforeEach(() => {
    validateWorkerToken = jest.fn().mockResolvedValue(worker);
    context = new GrpcWorkerContext();
    guard = new GrpcWorkerTokenGuard(
      { validateWorkerToken } as unknown as WorkersService,
      context,
    );
  });

  it('looks a token up once and serves the next calls from the cache', async () => {
    // When: a worker makes three calls in a row
    for (let call = 0; call < 3; call++) {
      await expect(guard.canActivate(callWithToken('token-a'))).resolves.toBe(true);
    }

    // Then
    expect(validateWorkerToken).toHaveBeenCalledTimes(1);
    expect(context.getWorker('token-a')).toBe(worker);
  });

  it('never caches a rejected token', async () => {
    // Given
    validateWorkerToken.mockResolvedValue(null);

    // When / Then: every call is checked against the database
    await expect(guard.canActivate(callWithToken('bad'))).rejects.toThrow();
    await expect(guard.canActivate(callWithToken('bad'))).rejects.toThrow();
    expect(validateWorkerToken).toHaveBeenCalledTimes(2);
  });
});
