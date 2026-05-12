import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { GrpcStreamMethod } from '@nestjs/microservices';
import { Request } from 'express';
import { Observable, Subject } from 'rxjs';

import { Doc } from '@/common/doc/doc.decorator';
import { UserContext } from '@/common/decorators/app.decorator';
import { AuthGuard } from '@/common/guards/auth.guard';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import { CliService } from './remote-execution.service';
import {
  CliOutputDto,
  CliOutputType,
  CreateSessionDto,
  SendCommandDto,
} from './dto/remote-execution.dto';
import { GrpcWorkerTokenGuard } from '@/common/guards/grpc-worker-token.guard';

interface RemoteExecutionCommand {
  sessionId: string;
  command: string;
  type: 'EXEC' | 'CANCEL';
}

interface RemoteExecutionOutput {
  sessionId: string;
  type: 'STDOUT' | 'STDERR' | 'EXIT' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  data: Buffer;
  exitCode: number;
}

const GRPC_TO_CLI_OUTPUT: Record<string, CliOutputType> = {
  STDOUT: CliOutputType.STDOUT,
  STDERR: CliOutputType.STDERR,
  EXIT: CliOutputType.EXIT,
  CONNECTED: CliOutputType.CONNECTED,
  DISCONNECTED: CliOutputType.DISCONNECTED,
  ERROR: CliOutputType.ERROR,
};

@Controller('remote-exec')
@UseGuards(AuthGuard)
export class RemoteExecutionController {
  private readonly logger = new Logger(RemoteExecutionController.name);

  constructor(private readonly cliService: CliService) {}

  @Doc({ summary: 'Create a new remote execution session' })
  @Post('sessions')
  async createSession(
    @Body() dto: CreateSessionDto,
    @UserContext() user: UserContextPayload,
  ) {
    return this.cliService.createSession(dto, user.id);
  }

  @Doc({ summary: 'Subscribe to session output stream (SSE)' })
  @Sse('sessions/:sessionId/stream')
  async stream(
    @Param('sessionId') sessionId: string,
    @UserContext() user: UserContextPayload,
    @Req() req: Request,
  ): Promise<Observable<{ data: string }>> {
    const session = await this.cliService.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (session.createdBy !== user.id) throw new ForbiddenException();

    const subject = new Subject<{ data: string }>();

    const messageHandler = (rawMessage: string) => {
      try {
        const message = JSON.parse(rawMessage) as CliOutputDto;
        subject.next({ data: JSON.stringify(message) });
      } catch {
        // ignore parse errors
      }
    };

    await this.cliService.subscribeToOutput(sessionId, messageHandler);

    req.on('close', () => {
      void this.cliService.unsubscribeFromOutput(sessionId);
      subject.complete();
    });

    return subject.asObservable();
  }

  @Doc({ summary: 'Send a command to a session' })
  @Post('sessions/:sessionId/commands')
  async sendCommand(
    @Param('sessionId') sessionId: string,
    @UserContext() user: UserContextPayload,
    @Body() dto: SendCommandDto,
  ) {
    const session = await this.cliService.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (session.createdBy !== user.id) throw new ForbiddenException();
    if (session.status !== 'active') {
      throw new HttpException('Session is not active', HttpStatus.BAD_REQUEST);
    }

    await this.cliService.publishCommand(sessionId, dto);
    return { success: true };
  }

  @Doc({ summary: 'Close a session' })
  @Delete('sessions/:sessionId')
  async closeSession(
    @Param('sessionId') sessionId: string,
    @UserContext() user: UserContextPayload,
  ) {
    const session = await this.cliService.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (session.createdBy !== user.id) throw new ForbiddenException();

    try {
      await this.cliService.updateSessionStatus(sessionId, 'closed');
      await this.cliService.publishOutput(sessionId, {
        type: CliOutputType.EXIT,
        exitCode: 0,
      });
    } finally {
      await this.cliService.deleteSession(sessionId);
    }

    return { success: true };
  }

  @UseGuards(GrpcWorkerTokenGuard)
  @GrpcStreamMethod('RemoteExecutionService', 'RemoteExecutionSession')
  remoteExecutionSession(
    messages: Observable<RemoteExecutionOutput>,
  ): Observable<RemoteExecutionCommand> {
    const subject = new Subject<RemoteExecutionCommand>();
    let sessionId: string | null = null;

    const inputHandler = (rawMessage: string) => {
      try {
        const cmd = JSON.parse(rawMessage) as RemoteExecutionCommand;
        subject.next(cmd);
      } catch {
        // ignore
      }
    };

    const cleanup = async (reason: 'disconnect' | 'error'): Promise<void> => {
      if (!sessionId) return;
      await this.cliService.unsubscribeFromInput(sessionId);
      await this.cliService.updateSessionStatus(sessionId, 'disconnected');
      await this.cliService.publishOutput(sessionId, {
        type:
          reason === 'error' ? CliOutputType.ERROR : CliOutputType.DISCONNECTED,
      });
      subject.complete();
    };

    messages.subscribe({
      next: (output) => {
        if (!output.sessionId) return;

        const handle = async (): Promise<void> => {
          if (!sessionId) {
            sessionId = output.sessionId;
            const session = await this.cliService.getSession(sessionId);
            if (!session) {
              subject.error(new Error(`Session ${sessionId} not found`));
              return;
            }
            await this.cliService.subscribeToInput(sessionId, inputHandler);
            this.logger.verbose(`Worker connected to session ${sessionId}`);
          }

          await this.cliService.publishOutput(sessionId, {
            type: GRPC_TO_CLI_OUTPUT[output.type] ?? CliOutputType.ERROR,
            data: output.data?.toString('utf8'),
            exitCode: output.exitCode,
          });
        };

        handle().catch((err: Error) => subject.error(err));
      },
      error: (err: Error) => {
        this.logger.error(
          `Worker stream error on session ${sessionId}: ${err.message}`,
        );
        cleanup('error').catch((e: Error) => this.logger.error(e.message));
      },
      complete: () => {
        this.logger.verbose(`Worker disconnected from session ${sessionId}`);
        cleanup('disconnect').catch((e: Error) => this.logger.error(e.message));
      },
    });

    return subject.asObservable();
  }
}
