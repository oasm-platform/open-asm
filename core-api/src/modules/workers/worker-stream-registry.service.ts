import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { RedisService } from '@/services/redis/redis.service';
import { WorkerScope } from '@/common/enums/enum';

/**
 * Redis channel carrying "stop this job" events. Published by
 * JobsRegistryService when a job is cancelled, consumed by every core-api
 * instance: only the one that actually holds the worker's stream delivers it.
 */
export const WORKER_STREAM_CANCEL_CHANNEL = 'worker:stream:cancel';

/**
 * Redis channel carrying "new jobs are claimable in this workspace" hints.
 * Every instance nudges the streams it holds for workers that can claim them.
 */
export const WORKER_STREAM_JOBS_CHANNEL = 'worker:stream:jobs';

/** Who a stream belongs to — enough to decide whether a jobs hint concerns it. */
export interface WorkerStreamOwner {
  workspaceId?: string | null;
  scope?: WorkerScope;
}

interface WorkerStream {
  subject: Subject<Record<string, unknown>>;
  owner: WorkerStreamOwner;
}

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
  private readonly outbound = new Map<string, WorkerStream>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    // RedisService fans every message to every callback, so each handler must
    // keep to its own channel.
    await this.redis.subscribe(WORKER_STREAM_CANCEL_CHANNEL, (channel, message) => {
      if (channel === WORKER_STREAM_CANCEL_CHANNEL) {
        this.handleCancelMessage(message);
      }
    });
    await this.redis.subscribe(WORKER_STREAM_JOBS_CHANNEL, (channel, message) => {
      if (channel === WORKER_STREAM_JOBS_CHANNEL) {
        this.handleJobsMessage(message);
      }
    });
  }

  onModuleDestroy(): void {
    for (const { subject } of this.outbound.values()) {
      subject.complete();
    }
    this.outbound.clear();
    for (const channel of [
      WORKER_STREAM_CANCEL_CHANNEL,
      WORKER_STREAM_JOBS_CHANNEL,
    ]) {
      void this.redis.unsubscribe(channel).catch(() => undefined);
    }
  }

  register(
    workerId: string,
    subject: Subject<Record<string, unknown>>,
    owner: WorkerStreamOwner = {},
  ): void {
    const existing = this.outbound.get(workerId)?.subject;
    if (existing && existing !== subject) {
      // A reconnect replaced the previous stream: close the stale one so the
      // worker stops writing into a half-dead stream.
      this.logger.warn(
        `[worker-stream] replacing an existing stream for worker ${workerId}`,
      );
      existing.complete();
    }
    this.outbound.set(workerId, { subject, owner });
  }

  unregister(
    workerId: string,
    subject: Subject<Record<string, unknown>>,
  ): void {
    if (this.outbound.get(workerId)?.subject === subject) {
      this.outbound.delete(workerId);
    }
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

  /**
   * Hint every instance that jobs became claimable in a workspace. Best-effort:
   * a lost hint only means workers find the jobs on their next idle poll.
   */
  async publishJobsAvailable(workspaceId: string): Promise<void> {
    await this.redis.publish(WORKER_STREAM_JOBS_CHANNEL, workspaceId);
  }

  private handleJobsMessage(workspaceId: string): void {
    if (!workspaceId) return;
    for (const [workerId, { subject, owner }] of this.outbound) {
      // Cloud workers claim across workspaces; everyone else only their own.
      // Tool/network filters are left to the claim: a false hint is one empty
      // NextBatch, far cheaper than mirroring the claim's eligibility here.
      if (
        owner.scope !== WorkerScope.CLOUD &&
        owner.workspaceId !== workspaceId
      ) {
        continue;
      }
      try {
        subject.next({ jobsAvailable: {} });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `[worker-stream] failed to nudge worker ${workerId}: ${message}`,
        );
      }
    }
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
    const subject = this.outbound.get(event.workerId)?.subject;
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
