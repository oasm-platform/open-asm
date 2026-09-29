import { Metadata } from '@grpc/grpc-js';
import { Controller, Inject, Logger } from '@nestjs/common';
import { GrpcStreamMethod, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, ReplaySubject } from 'rxjs';
import { Repository } from 'typeorm';
import { WORKER_TOKEN_HEADER } from '@/common/constants/app.constants';
import { WorkerInstance } from './entities/worker.entity';
import { WorkerStreamRegistry } from './worker-stream-registry.service';

/** Liveness cadence advertised to the worker; mirrors the legacy Alive RPC. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Bidirectional `WorkerStreamService.Connect`.
 *
 * The worker opens one long-lived stream and the two sides exchange:
 *   worker → core: register (handshake), heartbeat
 *   core → worker: register response, heartbeat ack, cancel
 *
 * Stage 1 only adds the push channel (cancel). Job results, telemetry and job
 * pull deliberately keep their existing RPCs.
 *
 * NestJS hands the request stream to the handler as an Observable that buffers
 * until the handler returns, so the subscription must be created SYNCHRONOUSLY
 * — the token lookup below is async and any frame that arrived meanwhile is
 * queued and replayed once authentication resolves. Subscribing later would
 * silently drop the register frame.
 */
@Controller()
export class WorkerStreamController {
  private readonly logger = new Logger(WorkerStreamController.name);

  constructor(
    @Inject(WorkerStreamRegistry)
    private readonly registry: WorkerStreamRegistry,
    @InjectRepository(WorkerInstance)
    private readonly workers: Repository<WorkerInstance>,
  ) {}

  @GrpcStreamMethod('WorkerStreamService', 'Connect')
  connect(
    frames$: Observable<Record<string, any>>,
    metadata: Metadata,
  ): Observable<Record<string, unknown>> {
    // ReplaySubject, not Subject: the token lookup below is async, so the
    // register response (or the auth error) can be produced BEFORE NestJS
    // subscribes to the returned observable. A plain Subject would drop those
    // first frames and the worker would never learn whether the stream was
    // accepted. Only the frames emitted before the first subscriber attach are
    // retained.
    const outbound$ = new ReplaySubject<Record<string, unknown>>();
    const queued: Record<string, any>[] = [];
    let authenticated = false;
    let closed = false;
    // The inbound stream can complete before the async token lookup settles
    // (a peer that registers and immediately disconnects). Finalizing on that
    // early `complete` would close the outbound before the auth result — and
    // therefore before the register response or the auth error — is ever
    // emitted, which ReplaySubject cannot rescue.
    let inboundClosed = false;
    let workerId: string | null = null;

    const emit = (message: Record<string, unknown>): void => {
      if (!closed) {
        outbound$.next(message);
      }
    };

    const finalize = (): void => {
      closed = true;
      if (workerId) {
        this.registry.unregister(workerId, outbound$);
        this.logger.log(`[worker-stream] stream closed for worker ${workerId}`);
      }
      outbound$.complete();
    };

    const handleFrame = (frame: Record<string, any>): void => {
      if (!frame) return;
      if (frame.register) {
        emit({
          registerResp: {
            workerId: workerId ?? '',
            accepted: true,
            heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
          },
        });
      } else if (frame.heartbeat) {
        emit({
          heartbeatAck: {
            workerId: workerId ?? '',
            serverTimeMs: Date.now(),
          },
        });
      }
    };

    void (async () => {
      try {
        const token = metadata?.get(WORKER_TOKEN_HEADER)?.[0] as
          | string
          | undefined;
        // The worker joins over the legacy Join RPC first, so by the time this
        // stream opens it already holds a persisted token. Re-validating it here
        // is what makes an unauthenticated peer unable to subscribe at all.
        const worker = token
          ? await this.workers.findOne({ where: { token } })
          : null;
        if (!worker) {
          closed = true;
          outbound$.error(new RpcException('Invalid worker token'));
          return;
        }
        if (closed) return;
        workerId = worker.id;
        authenticated = true;
        this.registry.register(workerId, outbound$);
        this.logger.log(
          `[worker-stream] stream opened for worker ${workerId}`,
        );
        while (queued.length > 0) {
          handleFrame(queued.shift() as Record<string, any>);
        }
        if (inboundClosed) {
          finalize();
        }
      } catch (error) {
        closed = true;
        outbound$.error(
          error instanceof Error ? error : new Error('stream auth failed'),
        );
      }
    })();

    frames$.subscribe({
      next: (frame) => {
        if (authenticated) {
          handleFrame(frame);
        } else {
          queued.push(frame);
        }
      },
      error: (error: Error) => {
        closed = true;
        outbound$.error(error);
      },
      complete: () => {
        inboundClosed = true;
        if (authenticated) {
          finalize();
        }
      },
    });

    return outbound$.asObservable();
  }
}
