import { Body, Controller, Post, Sse } from '@nestjs/common';
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
  async runCommand(@Body() dto: RunCommandDto) {
    return this.remoteExecuteService.runCommand(dto.command);
  }

  @Sse('stream')
  @Doc({
    summary: 'Subscribe to remote-execute stream',
    description:
      'Server-Sent Events endpoint that streams all commands published to the ' +
      'remote-execute channel in real-time. Each event is a JSON-encoded RemoteCommandPayload.',
  })
  stream(): Observable<MessageEvent> {
    return this.remoteExecuteService.subscribeToStream();
  }
}
