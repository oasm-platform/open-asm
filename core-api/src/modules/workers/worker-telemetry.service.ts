import { status } from '@grpc/grpc-js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { WorkerInstance } from './entities/worker.entity';
import {
  normalizeWorkerTelemetry,
  type WorkerTelemetryAck,
  type WorkerTelemetryRequest,
  type WorkerTelemetrySnapshot,
} from './worker-telemetry.types';
import { WorkerTelemetryStore } from './worker-telemetry.store';

@Injectable()
export class WorkerTelemetryService {
  private readonly logger = new Logger(WorkerTelemetryService.name);

  constructor(
    @Inject(WorkerTelemetryStore)
    private readonly store: WorkerTelemetryStore,
  ) {}

  async record(
    worker: Pick<WorkerInstance, 'id'>,
    request: WorkerTelemetryRequest,
    receivedAt = new Date(),
  ): Promise<WorkerTelemetryAck> {
    const snapshot = normalizeWorkerTelemetry(worker.id, request, receivedAt);
    try {
      await this.store.write(snapshot);
    } catch {
      throw new RpcException({
        code: status.UNAVAILABLE,
        message: 'Worker telemetry storage is unavailable',
      });
    }
    return {
      acceptedSequence: snapshot.sequence,
      receivedAt: snapshot.receivedAt,
      workerId: snapshot.workerId,
      nextReportAfterMs: 10_000,
    };
  }

  async get(
    workerId: string,
    now = new Date(),
  ): Promise<WorkerTelemetrySnapshot | null> {
    try {
      return await this.store.read(workerId, now);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to read worker telemetry: ${message}`);
      return null;
    }
  }
}
