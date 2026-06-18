import { WORKER_TOKEN_HEADER } from '@/common/constants/app.constants';
import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Metadata } from '@grpc/grpc-js';
import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { Observable } from 'rxjs';
import {
  GetManyWorkersDto,
  WorkerAliveDto,
  WorkerJoinDto,
} from './dto/workers.dto';
import { WorkerInstance } from './entities/worker.entity';
import { AliveStreamManager } from './alive-stream-manager.service';
import {
  RemoteExecuteCommand,
  RemoteExecuteSubscribeService,
} from './remote-execute-subscribe.service';
import { WorkersService } from './workers.service';

interface GrpcCall {
  getPeer?(): string | undefined;
}

@ApiTags('Workers')
@Controller('workers')
export class WorkersController {
  private readonly logger = new Logger(WorkersController.name);
  constructor(
    private readonly workersService: WorkersService,
    private readonly remoteExecuteSubscribeService: RemoteExecuteSubscribeService,
    private readonly grpcWorkerContext: GrpcWorkerContext,
    private readonly aliveStreamManager: AliveStreamManager,
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
    summary: 'Get all workers with pagination and sorting.',
    description:
      'Fetches a paginated list of all active security assessment workers in the cluster.',
    response: {
      serialization: GetManyResponseDto(WorkerInstance),
    },
  })
  @Get()
  getWorkers(@Query() query: GetManyWorkersDto) {
    return this.workersService.getWorkers(query);
  }

  @GrpcMethod('WorkersService', 'GetManifest')
  grpcGetManifest(): { initCommands: string[] } {
    return {
      initCommands: ['nuclei -ut --silent'],
    };
  }

  @GrpcMethod('WorkersService', 'Storage')
  grpcStorage(request: {
    path: string;
  }): Observable<{ chunk: Buffer; offset: number; eof: boolean }> {
    return new Observable((subscriber) => {
      const normalizedPath = request.path.replace(/^static/, 'public');
      const filePath = join(process.cwd(), normalizedPath);
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
      signature: string;
      token?: string;
      metadata?: { name?: string; os?: string };
    },
    call: GrpcCall,
  ): Promise<{ workerId: string; workerToken: string }> {
    const peer = call?.getPeer?.();
    const ipAddress = typeof peer === 'string' ? peer.split(':')[0] : undefined;

    const worker = await this.workersService.join({
      apiKey: requests.apiKey,
      signature: requests.signature,
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
          void this.workersService.releaseWorkerJobs(registeredWorkerId);
        }
      };
    });
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

  @GrpcMethod('WorkersService', 'BuiltinToolRegistry')
  async grpcBuiltinToolRegistry(request: {
    os: string;
    arch: string;
  }): Promise<{ toolPaths: string[] }> {
    const platform = `${request.os.toLowerCase()}_${request.arch.toLowerCase()}`;
    const platformPath = join(process.cwd(), 'public/archived', platform);

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
    const tokenValues = metadata.get(WORKER_TOKEN_HEADER);
    const workerToken = tokenValues?.[0] as string | undefined;
    const worker = this.grpcWorkerContext.getWorker(workerToken!);

    if (!worker) {
      throw new RpcException('Worker not found in context');
    }

    const { subject, observable } =
      this.remoteExecuteSubscribeService.registerWorker(worker);

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
  async grpcRemoteExecuteResult(request: {
    id: string;
    sessionId: string;
    type: number;
    data: Uint8Array;
    exitCode: number;
  }): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `[grpcRemoteExecuteResult] Received: sessionId=${request.sessionId}, type=${request.type}, exitCode=${request.exitCode}`,
    );
    await this.workersService.handleRemoteExecuteResult(request);
    return { success: true, message: 'Result acknowledged' };
  }
}
