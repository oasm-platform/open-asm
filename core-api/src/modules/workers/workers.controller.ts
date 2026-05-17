import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
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
import { WorkersService } from './workers.service';

interface GrpcCall {
  getPeer?(): string | undefined;
}

@ApiTags('Workers')
@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

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
  grpcGetManifest(): { downloadToolsUrl: string; initCommands: string[] } {
    return {
      downloadToolsUrl: '/public/archived/tools.tar.gz',
      initCommands: ['nuclei -ut'],
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

      const updateAlive = async () => {
        try {
          const worker = await this.workersService.alive({
            token: request.workerToken,
          });
          if (worker) {
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
  async grpcBuiltinToolRegistry(): Promise<{
    linux: string[];
    windows: string[];
    macos: string[];
  }> {
    const archivedPath = join(process.cwd(), 'public/archived');

    const getFiles = async (dir: string): Promise<string[]> => {
      try {
        const files = await readdir(dir);
        return files;
      } catch {
        return [];
      }
    };

    const [linux, windows, macos] = await Promise.all([
      getFiles(join(archivedPath, 'linux')),
      getFiles(join(archivedPath, 'windows')),
      getFiles(join(archivedPath, 'macos')),
    ]);

    return {
      linux: linux.map((f) => `static/archived/linux/${f}`),
      windows: windows.map((f) => `static/archived/windows/${f}`),
      macos: macos.map((f) => `static/archived/macos/${f}`),
    };
  }
}
