import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '@/common/doc/doc.decorator';
import { RemoteExecuteService } from './remote-execute.service';
import { RunCommandDto } from './dto/run-command.dto';
import type { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

@ApiTags('Remote Execute')
@Controller('remote-execute')
export class RemoteExecuteController {
  constructor(
    private readonly remoteExecuteService: RemoteExecuteService,
  ) {}

  @Post('run')
  @Doc({
    summary: 'Run a remote command',
    description:
      'Publishes a command to the remote-execute channel via Redis pub/sub. ' +
      'The command is enriched with an id (nanoid) and sessionId (uuid) before publishing.',
  })
  runCommand(@Body() dto: RunCommandDto) {
    const result = this.remoteExecuteService.runCommand(
      dto.command,
      dto.sessionId,
    );

    if (!result) {
      return { error: 'No available worker for remote execution' };
    }

    return result;
  }

  @Sse('stream')
  @Doc({
    summary: 'Subscribe to remote-execute stream',
    description:
      'Server-Sent Events endpoint that streams commands published to the ' +
      'remote-execute channel for a specific sessionId in real-time. Each event is a JSON-encoded RemoteCommandPayload.',
  })
  stream(@Query('sessionId') sessionId: string): Observable<MessageEvent> {
    return this.remoteExecuteService.subscribeToStream(sessionId);
  }
}
