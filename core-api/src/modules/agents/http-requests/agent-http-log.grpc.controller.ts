import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import type { Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  AgentHttpIngestService,
  type EgressHttpLogInput,
  type IngestResult,
} from './agent-http-ingest.service';

/** Bounds one batch's insert; the worker sends 200 at most. */
const MAX_BATCH = 1_000;

/**
 * `WorkersService.ReportEgressHttpLogs` lives here, not in the workers
 * module: agents already imports workers, so the reverse would be a cycle.
 * Nest routes each gRPC method to whichever controller declares it.
 */
@Controller()
export class AgentHttpLogGrpcController {
  constructor(
    private readonly ingestService: AgentHttpIngestService,
    private readonly grpcWorkerContext: GrpcWorkerContext,
  ) {}

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'ReportEgressHttpLogs')
  async reportEgressHttpLogs(
    request: { logs?: EgressHttpLogInput[]; dropped?: string },
    metadata: Metadata,
  ): Promise<IngestResult> {
    const worker = this.grpcWorkerContext.requireWorker(metadata);
    const logs = request.logs ?? [];
    const overflow = Math.max(0, logs.length - MAX_BATCH);
    const dropped = Number(request.dropped ?? 0) || 0;

    const result = await this.ingestService.ingest(
      worker.id,
      logs.slice(0, MAX_BATCH),
      dropped,
    );
    return { accepted: result.accepted, rejected: result.rejected + overflow };
  }
}
