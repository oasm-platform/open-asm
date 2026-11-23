import type { Metadata } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import {
  WORKER_TOKEN_CACHE_MS,
  WORKER_TOKEN_HEADER,
} from '../constants/app.constants';

interface AuthenticatedWorker {
  worker: WorkerInstance;
  /** `Date.now()` when the guard last checked the token against the database. */
  checkedAt: number;
}

@Injectable()
export class GrpcWorkerContext {
  /** Insertion order is check order: `setWorker` re-inserts. */
  private readonly workers = new Map<string, AuthenticatedWorker>();

  setWorker(token: string, worker: WorkerInstance): void {
    const now = Date.now();
    this.workers.delete(token);
    this.workers.set(token, { worker, checkedAt: now });
    this.evictExpired(now);
  }

  getWorker(token: string): WorkerInstance | undefined {
    return this.workers.get(token)?.worker;
  }

  /**
   * The worker for `token` if the guard checked it within
   * `WORKER_TOKEN_CACHE_MS`, so a worker's calls cost one database lookup per
   * window instead of one each. A deleted worker keeps working on this
   * instance for at most that long.
   */
  getFresh(token: string): WorkerInstance | undefined {
    const entry = this.workers.get(token);
    if (!entry || Date.now() - entry.checkedAt >= WORKER_TOKEN_CACHE_MS) {
      return undefined;
    }
    return entry.worker;
  }

  /** Tokens currently held; for tests. */
  size(): number {
    return this.workers.size;
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
    const worker = this.workers.get(token)?.worker;
    if (!worker) {
      throw new RpcException('Worker is not authenticated');
    }
    return worker;
  }

  /**
   * Drops tokens not checked for two cache windows, oldest first. Twice the
   * window, so a call whose guard ran just inside it still finds its worker in
   * the handler. Without this, every worker identity ever seen stayed in memory.
   */
  private evictExpired(now: number): void {
    for (const [token, entry] of this.workers) {
      if (now - entry.checkedAt < 2 * WORKER_TOKEN_CACHE_MS) return;
      this.workers.delete(token);
    }
  }
}
