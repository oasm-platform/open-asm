import type { Metadata } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';

@Injectable()
export class GrpcWorkerContext {
  private readonly workers = new Map<string, WorkerInstance>();

  setWorker(token: string, worker: WorkerInstance): void {
    this.workers.set(token, worker);
  }

  getWorker(token: string): WorkerInstance | undefined {
    return this.workers.get(token);
  }

  /**
   * The worker `GrpcWorkerTokenGuard` authenticated for this call's token.
   * Handlers take their identity from here, never from a worker id the
   * caller put in the request.
   */
  requireWorker(metadata: Metadata): WorkerInstance {
    const token = metadata.get(WORKER_TOKEN_HEADER)?.[0];
    if (typeof token !== 'string' || !token) {
      throw new RpcException('Worker token is missing');
    }
    const worker = this.workers.get(token);
    if (!worker) {
      throw new RpcException('Worker is not authenticated');
    }
    return worker;
  }
}
