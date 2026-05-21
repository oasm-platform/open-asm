import { Injectable } from '@nestjs/common';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';

@Injectable()
export class GrpcWorkerContext {
  private readonly workers = new Map<string, WorkerInstance>();

  setWorker(token: string, worker: WorkerInstance): void {
    this.workers.set(token, worker);
  }

  getWorker(token: string): WorkerInstance | undefined {
    return this.workers.get(token);
  }
}
