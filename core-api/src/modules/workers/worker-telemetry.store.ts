import type {
  WorkerTelemetrySnapshot,
} from './worker-telemetry.types';

export abstract class WorkerTelemetryStore {
  abstract write(snapshot: WorkerTelemetrySnapshot): Promise<void>;
  abstract read(
    workerId: string,
    now: Date,
  ): Promise<WorkerTelemetrySnapshot | null>;
}
