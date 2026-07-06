import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface AliveStreamMetadata {
  workerToken: string;
  connectedAt: Date;
  lastAliveAt: Date;
  streamId: string;
}

@Injectable()
export class AliveStreamManager implements OnModuleDestroy {
  private readonly logger = new Logger(AliveStreamManager.name);

  private readonly activeStreams = new Map<string, AliveStreamMetadata>();

  private streamCounter = 0;

  register(workerId: string, workerToken: string): string {
    const streamId = `stream-${++this.streamCounter}`;
    const now = new Date();
    this.activeStreams.set(workerId, {
      workerToken,
      connectedAt: now,
      lastAliveAt: now,
      streamId,
    });
    this.logger.log(
      `[AliveStreamManager] Worker ${workerId} stream ${streamId} registered`,
    );
    return streamId;
  }

  /**
   * Unregister a worker stream only if the streamId matches the current registration.
   * This prevents a stale teardown from removing a newer stream registration
   * when a worker reconnects quickly.
   */
  unregister(workerId: string, streamId: string): void {
    const current = this.activeStreams.get(workerId);
    if (!current) {
      return;
    }

    if (current.streamId !== streamId) {
      this.logger.verbose(
        `[AliveStreamManager] Worker ${workerId} stream ${streamId} finalized but current is ${current.streamId} — skipping`,
      );
      return;
    }

    this.activeStreams.delete(workerId);
    this.logger.log(
      `[AliveStreamManager] Worker ${workerId} stream ${streamId} unregistered`,
    );
  }

  isActive(workerId: string): boolean {
    return this.activeStreams.has(workerId);
  }

  updateAlive(workerId: string): void {
    const metadata = this.activeStreams.get(workerId);
    if (metadata) {
      metadata.lastAliveAt = new Date();
    }
  }

  getActiveWorkerIds(): Set<string> {
    return new Set(this.activeStreams.keys());
  }

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  getMetadata(workerId: string): AliveStreamMetadata | undefined {
    return this.activeStreams.get(workerId);
  }

  clear(): void {
    this.activeStreams.clear();
    this.logger.log('[AliveStreamManager] All streams cleared');
  }

  onModuleDestroy() {
    this.clear();
  }
}
