import { RedisService } from '@/services/redis/redis.service';
import { Injectable } from '@nestjs/common';
import {
  WORKER_TELEMETRY_FRESH_MS,
  WORKER_TELEMETRY_TTL_SECONDS,
  isWorkerTelemetrySnapshot,
  type WorkerTelemetrySnapshot,
} from './worker-telemetry.types';
import { WorkerTelemetryStore } from './worker-telemetry.store';

@Injectable()
export class RedisWorkerTelemetryStore extends WorkerTelemetryStore {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  private key(workerId: string): string {
    return `oasm:worker:telemetry:v1:${workerId}`;
  }

  override async write(snapshot: WorkerTelemetrySnapshot): Promise<void> {
    await this.redisService.setWithExpiry(
      this.key(snapshot.workerId),
      WORKER_TELEMETRY_TTL_SECONDS,
      JSON.stringify(snapshot),
    );
  }

  override async read(
    workerId: string,
    now: Date,
  ): Promise<WorkerTelemetrySnapshot | null> {
    const raw = await this.redisService.get(this.key(workerId));
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isWorkerTelemetrySnapshot(parsed)) return null;
    if (parsed.workerId !== workerId) return null;

    const age = Math.max(0, now.getTime() - new Date(parsed.receivedAt).getTime());
    if (age >= WORKER_TELEMETRY_TTL_SECONDS * 1000) return null;
    return {
      ...parsed,
      freshness: age <= WORKER_TELEMETRY_FRESH_MS ? 'fresh' : 'stale',
    };
  }
}
