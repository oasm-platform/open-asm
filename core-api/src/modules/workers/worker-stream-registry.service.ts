import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { RedisService } from '@/services/redis/redis.service';

/**
 * Redis channel carrying "stop this job" events. Published by
 * JobsRegistryService when a job is cancelled, consumed by every core-api
 * instance: only the one that actually holds the worker's stream delivers it.
 */
export const WORKER_STREAM_CANCEL_CHANNEL = 'worker:stream:cancel';

export interface WorkerStreamCancelEvent {
  workerId: string;
  jobId: string;
  reason: string;
  cancelledBy?: string;
}

/**
 * Tracks the live worker↔core bidirectional streams on THIS instance and
 * routes cancellation events to the right one.
 *
 * Core-api can run with several instances behind a load balancer, so the
 * instance handling the cancel HTTP request is usually NOT the one holding the
 * worker's stream. Cancellations are therefore published to Redis and every
 * instance applies the ones for workers it actually streams; the rest drop
 * them. This is deliberately "broadcast, holder acts" so a stale instance id can
 * never route a cancel into the void.
 */
@Injectable()
export class WorkerStreamRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerStreamRegistry.name);
  private readonly outbound = new Map<string, Subject<Record<string, unknown>>>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.redis.subscribe(
      WORKER_STREAM_CANCEL_CHANNEL,
      (_channel, message) => this.handleCancelMessage(message),
    );
  }

  onModuleDestroy(): void {
    for (const subject of this.outbound.values()) {
      subject.complete();
    }
    this.outbound.clear();
    void this.redis
      .unsubscribe(WORKER_STREAM_CANCEL_CHANNEL)
      .catch(() => undefined);
  }

  register(
    workerId: string,
    subject: Subject<Record<string, unknown>>,
  ): void {
    const existing = this.outbound.get(workerId);
    if (existing && existing !== subject) {
      // A reconnect replaced the previous stream: close the stale one so the
      // worker stops writing into a half-dead stream.
      this.logger.warn(
        `[worker-stream] replacing an existing stream for worker ${workerId}`,
      );
      existing.complete();
    }
    this.outbound.set(workerId, subject);
  }

  unregister(
    workerId: string,
    subject: Subject<Record<string, unknown>>,
  ): void {
    if (this.outbound.get(workerId) === subject) {
      this.outbound.delete(workerId);
    }
  }

  hasStream(workerId: string): boolean {
    return this.outbound.has(workerId);
  }

  /**
   * Fan a cancel out to all instances. Failures are surfaced to the caller
   * (job cancellation still succeeds in the DB; the worker simply keeps
   * running until its own timeout if the event cannot be routed).
   */
  async publishCancel(event: WorkerStreamCancelEvent): Promise<void> {
    await this.redis.publish(
      WORKER_STREAM_CANCEL_CHANNEL,
      JSON.stringify(event),
    );
  }

  private handleCancelMessage(message: string): void {
    let event: WorkerStreamCancelEvent;
    try {
      event = JSON.parse(message) as WorkerStreamCancelEvent;
    } catch {
      this.logger.warn('[worker-stream] discarding malformed cancel event');
      return;
    }
    if (!event?.workerId || !event?.jobId) {
      return;
    }
    const subject = this.outbound.get(event.workerId);
    if (!subject) {
      // Another instance holds this worker's stream — nothing to do here.
      return;
    }
    try {
      subject.next({
        cancel: {
          jobId: event.jobId,
          reason: event.reason || 'cancelled',
          cancelledBy: event.cancelledBy,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `[worker-stream] failed to deliver cancel for job ${event.jobId}: ${message}`,
      );
    }
  }
}
