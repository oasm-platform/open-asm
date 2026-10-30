import {
  parseTrustedProxies,
  resolveClientIp,
} from '@/common/config/trusted-proxies';
import {
  AGENT_SANDBOX_HEADER,
  REMOTE_EXECUTE_KEEPALIVE_HEADER,
  WORKER_TOKEN_HEADER,
} from '@/common/constants/app.constants';
import { Public, UserContext } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role, WorkerScope } from '@/common/enums/enum';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Metadata } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { Observable } from 'rxjs';
import {
  GetManyWorkersDto,
  GetWorkerResponseDto,
  WorkerAliveDto,
  WorkerJoinDto,
  WorkerJoinKeyResponseDto,
  WorkerListItemDto,
} from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';
import { AliveStreamManager } from './alive-stream-manager.service';
import {
  RemoteExecuteCommand,
  RemoteExecuteSubscribeService,
} from './remote-execute-subscribe.service';
import { WorkersService } from './workers.service';
import { WorkerJoinKeyService } from './worker-join-key.service';
import { WorkerTelemetryService } from './worker-telemetry.service';
import type {
  WorkerTelemetryAck,
  WorkerTelemetryRequest,
} from './worker-telemetry.types';

interface GrpcCall {
  getPeer?(): string | undefined;
}

/** grpc-js peers are "host:port" or "[ipv6]:port". */
function peerIp(peer: string | undefined): string | undefined {
  if (!peer) return undefined;
  const bracketed = /^\[(.+)\]:\d+$/.exec(peer);
  if (bracketed) return bracketed[1];
  const colon = peer.lastIndexOf(':');
  return colon === -1 ? peer : peer.slice(0, colon);
}

interface GrpcTimestamp {
  seconds: string;
  nanos: number;
}

interface GrpcWorkerTelemetryAck
  extends Omit<WorkerTelemetryAck, 'receivedAt'> {
  receivedAt: GrpcTimestamp;
}

function toGrpcTimestamp(value: string): GrpcTimestamp {
  const milliseconds = new Date(value).getTime();
  return {
    seconds: Math.floor(milliseconds / 1000).toString(),
    nanos: (milliseconds % 1000) * 1_000_000,
  };
}

/** Tool archives served to workers, relative to the core-api working dir. */
const TOOL_ARCHIVE_DIR = 'public/archived';

@ApiTags('Workers')
@Controller('workers')
export class WorkersController {
  private readonly logger = new Logger(WorkersController.name);
  constructor(
    private readonly workersService: WorkersService,
    private readonly remoteExecuteSubscribeService: RemoteExecuteSubscribeService,
    private readonly grpcWorkerContext: GrpcWorkerContext,
    private readonly aliveStreamManager: AliveStreamManager,
    private readonly workerTelemetryService: WorkerTelemetryService,
    private readonly workerJoinKeyService: WorkerJoinKeyService,
  ) {}

  @Doc({
    summary: 'Worker alive',
    description:
      'Confirms the operational status of a security assessment worker node in the cluster.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Public()
  @Post('/alive')
  alive(@Body() dto: WorkerAliveDto) {
    return this.workersService.alive(dto);
  }

  @Doc({
    summary: 'Worker join',
    description:
      'Registers a new security assessment worker node to the distributed processing cluster.',
    response: {
      serialization: WorkerInstance,
    },
  })
  @Public()
  @Post('join')
  join(@Body() dto: WorkerJoinDto) {
    return this.workersService.join(dto);
  }

  @Doc({
    summary: 'Create a worker join key',
    description:
      'Issues a one-time API key a worker joins this workspace with. It expires after a few minutes and is consumed by the first successful join; the `worker.joined` live event carries its id as `joinKeyId`.',
    response: {
      serialization: WorkerJoinKeyResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.apikey')
  @Post('join-keys')
  createJoinKey(
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ): Promise<WorkerJoinKeyResponseDto> {
    return this.workerJoinKeyService.create(workspaceId, user.id);
  }

  @Doc({
    summary: 'Rotate a worker join key',
    description:
      'Deletes the join key `id` and issues a new one. An already expired or used key is simply replaced.',
    response: {
      serialization: WorkerJoinKeyResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.apikey')
  @Post('join-keys/:id/rotate')
  rotateJoinKey(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ): Promise<WorkerJoinKeyResponseDto> {
    return this.workerJoinKeyService.rotate(workspaceId, user.id, id);
  }

  @Doc({
    summary: 'Revoke a worker join key',
    description:
      'Deletes the join key `id` before it expires, e.g. when the connect dialog closes.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('workspace.apikey')
  @Delete('join-keys/:id')
  async revokeJoinKey(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.workerJoinKeyService.revoke(workspaceId, id);
    return { message: 'Join key revoked' };
  }

  @Doc({
    summary: 'Get all workers with pagination and sorting.',
    description:
      'Fetches a paginated list of all active security assessment workers in the cluster. Each row carries only list fields; use GET /workers/:id for tools and details.',
    response: {
      serialization: GetManyResponseDto(WorkerListItemDto),
    },
  })
  @WorkspaceAccess('worker.read')
  @Get()
  getWorkers(
    @Query() query: GetManyWorkersDto,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ) {
    // Global workers run every workspace's jobs, so only admins may list
    // them; everyone else only sees their own workspace's workers.
    const isAdmin = user.role === Role.ADMIN;
    if (query.scope === WorkerScope.CLOUD && !isAdmin) {
      throw new ForbiddenException('Only admins can view global workers');
    }
    return this.workersService.getWorkerList({
      ...query,
      workspaceId,
      scope: isAdmin ? query.scope : WorkerScope.WORKSPACE,
    });
  }

  @Doc({
    summary: 'Get a worker by ID',
    description:
      'Retrieves a single worker by its ID, including its connected tools.',
    response: {
      serialization: GetWorkerResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @WorkspaceAccess('worker.read')
  @Get(':id')
  getWorkerById(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserContext() user: UserContextPayload,
  ): Promise<GetWorkerResponseDto> {
    return this.workersService.getWorkerById(
      id,
      workspaceId,
      user.role === Role.ADMIN,
    );
  }

  @GrpcMethod('WorkersService', 'GetManifest')
  grpcGetManifest() {
    return {
      initCommands: [],
    };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'Storage')
  grpcStorage(request: {
    path: string;
  }): Observable<{ chunk: Buffer; offset: number; eof: boolean }> {
    return new Observable((subscriber) => {
      // Workers only download tool archives (the paths BuiltinToolRegistry
      // lists); anything resolving outside that tree — .env, ../ — is refused.
      const archiveRoot = resolve(process.cwd(), TOOL_ARCHIVE_DIR);
      const filePath = resolve(
        process.cwd(),
        request.path.replace(/^static/, 'public'),
      );
      if (!filePath.startsWith(archiveRoot + sep)) {
        subscriber.error(new RpcException('Path is outside the tool archive'));
        return;
      }
      const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
      let offset = 0;

      stream.on('data', (chunk: Buffer) => {
        subscriber.next({ chunk, offset, eof: false });
        offset += chunk.length;
      });

      stream.on('end', () => {
        subscriber.next({ chunk: Buffer.alloc(0), offset, eof: true });
        subscriber.complete();
      });

      stream.on('error', (err) => {
        subscriber.error(err);
      });
    });
  }

  @GrpcMethod('WorkersService', 'Join')
  async grpcJoin(
    requests: {
      apiKey: string;
      token?: string;
      metadata?: { name?: string; os?: string; mode?: number | string };
    },
    grpcMetadata: Metadata,
    call: GrpcCall,
  ): Promise<{ workerId: string; workerToken: string }> {
    const forwardedFor = grpcMetadata?.get('x-forwarded-for')?.[0];
    const ipAddress = resolveClientIp(
      peerIp(call?.getPeer?.()),
      typeof forwardedFor === 'string' ? forwardedFor : undefined,
      parseTrustedProxies(process.env.TRUSTED_PROXIES),
    );

    const worker = await this.workersService.join({
      apiKey: requests.apiKey,
      token: requests.token,
      metadata: requests.metadata,
      ipAddress,
    });

    return {
      workerId: worker.id,
      workerToken: worker.token,
    };
  }

  @GrpcMethod('WorkersService', 'Alive')
  grpcAlive(request: {
    workerToken: string;
  }): Observable<{ alive: boolean; lastSeenAt: string; workerId: string }> {
    return new Observable((subscriber) => {
      let intervalId: NodeJS.Timeout;
      let registeredWorkerId: string | undefined;
      let streamId: string | undefined;

      const updateAlive = async () => {
        try {
          const worker = await this.workersService.alive({
            token: request.workerToken,
          });
          if (worker) {
            if (!registeredWorkerId) {
              streamId = this.aliveStreamManager.register(
                worker.id,
                request.workerToken,
              );
              registeredWorkerId = worker.id;
            } else {
              this.aliveStreamManager.updateAlive(registeredWorkerId);
            }
            subscriber.next({
              alive: true,
              lastSeenAt: worker.lastSeenAt.toISOString(),
              workerId: worker.id,
            });
          } else {
            subscriber.error(new Error('Worker not found after update.'));
          }
        } catch (err) {
          subscriber.error(err);
        }
      };

      void updateAlive().then(() => {
        intervalId = setInterval(() => {
          void updateAlive();
        }, 10000);
      });

      return () => {
        if (intervalId) clearInterval(intervalId);
        if (registeredWorkerId && streamId) {
          this.aliveStreamManager.unregister(registeredWorkerId, streamId);
          this.logger.log(
            `[grpcAlive] Worker ${registeredWorkerId} stream disconnected, releasing jobs`,
          );
          const workerId = registeredWorkerId;
          this.workersService
            .workerDisconnected(workerId)
            .catch((error: unknown) =>
              this.logger.error(
                `[grpcAlive] Worker ${workerId} disconnect handling failed: ${
                  error instanceof Error ? error.message : 'unknown error'
                }`,
              ),
            );
        }
      };
    });
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'WorkerTelemetry')
  async grpcWorkerTelemetry(
    request: WorkerTelemetryRequest,
    metadata: Metadata,
  ): Promise<GrpcWorkerTelemetryAck> {
    const workerToken = metadata.get(WORKER_TOKEN_HEADER)[0] as
      | string
      | undefined;
    if (!workerToken) {
      throw new RpcException('Worker token is missing');
    }
    const worker = this.grpcWorkerContext.getWorker(workerToken);
    if (!worker) {
      throw new RpcException('Worker not found in context');
    }
    const response = await this.workerTelemetryService.record(worker, request);
    return {
      ...response,
      receivedAt: toGrpcTimestamp(response.receivedAt),
    };
  }

  @GrpcMethod('WorkersService', 'ConnectInternalNetwork')
  @UseGuards(GrpcWorkerTokenGuard)
  async grpcConnectInternalNetwork(request: {
    workerId: string;
    networkId: string;
    networkInterfaces: Array<{
      interfaceName: string;
      ipAddress: string;
      cidr: string;
      gatewayIp: string;
      gatewayMac: string;
    }>;
  }): Promise<{ message: string }> {
    return this.workersService.connectInternalNetwork(request);
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'BuiltinToolRegistry')
  async grpcBuiltinToolRegistry(request: {
    os: string;
    arch: string;
  }): Promise<{ toolPaths: string[] }> {
    const platform = `${request.os.toLowerCase()}_${request.arch.toLowerCase()}`;
    // GOOS_GOARCH only: os/arch come from the worker and are joined into a path.
    if (!/^[a-z0-9]+_[a-z0-9]+$/.test(platform)) {
      return { toolPaths: [] };
    }
    const platformPath = join(process.cwd(), TOOL_ARCHIVE_DIR, platform);

    try {
      const files = await readdir(platformPath);
      return {
        toolPaths: files.map((file) => `static/archived/${platform}/${file}`),
      };
    } catch {
      return { toolPaths: [] };
    }
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'RemoteExecuteSubscribe')
  grpcRemoteExecuteSubscribe(
    _request: Record<string, never>,
    metadata: Metadata,
  ): Observable<RemoteExecuteCommand> {
    const worker = this.getGrpcWorker(metadata);
    // "1" = the worker runs agent shell commands in a per-session sandbox
    const sandboxed =
      String(metadata.get(AGENT_SANDBOX_HEADER)?.[0] ?? '') === '1';
    const keepalive =
      String(metadata.get(REMOTE_EXECUTE_KEEPALIVE_HEADER)?.[0] ?? '') === '1';

    const { subject, observable } =
      this.remoteExecuteSubscribeService.registerWorker(worker, {
        sandboxed,
        keepalive,
      });

    subject.next({
      id: '',
      workerId: '',
      type: 1, // REMOTE_EXECUTE_SUBSCRIBE_EVENT_CONNECTED
      sessionId: '',
      command: '',
    });

    return observable;
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcMethod('WorkersService', 'RemoteExecuteResult')
  async grpcRemoteExecuteResult(
    request: {
      id: string;
      sessionId: string;
      type: number;
      data: Uint8Array;
      exitCode: number;
    },
    metadata: Metadata,
  ): Promise<{ success: boolean; message: string }> {
    const worker = this.getGrpcWorker(metadata);
    this.logger.log(
      `[grpcRemoteExecuteResult] Received: sessionId=${request.sessionId}, type=${request.type}, exitCode=${request.exitCode}, worker=${worker.id}`,
    );
    // Only the worker the session was pushed to may answer for it
    if (
      !this.remoteExecuteSubscribeService.isResultFromAssignedWorker(
        request.sessionId,
        worker.id,
      )
    ) {
      this.logger.warn(
        `[grpcRemoteExecuteResult] Dropped a result for session ${request.sessionId} from worker ${worker.id}: the session is assigned to another worker`,
      );
      return {
        success: false,
        message: 'Session is not assigned to this worker',
      };
    }
    await this.workersService.handleRemoteExecuteResult(request);
    return { success: true, message: 'Result acknowledged' };
  }

  /** The worker GrpcWorkerTokenGuard resolved from the call's token. */
  private getGrpcWorker(metadata: Metadata): WorkerInstance {
    const workerToken = metadata.get(WORKER_TOKEN_HEADER)?.[0] as
      string | undefined;
    const worker = workerToken
      ? this.grpcWorkerContext.getWorker(workerToken)
      : undefined;
    if (!worker) {
      throw new RpcException('Worker not found in context');
    }
    return worker;
  }
}
