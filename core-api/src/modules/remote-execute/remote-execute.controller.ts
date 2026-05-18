import {
  Body,
  Controller,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '@/common/doc/doc.decorator';
import { RemoteExecuteService } from './remote-execute.service';
import { RunCommandDto } from './dto/run-command.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { UserContext } from '@/common/decorators/app.decorator';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import type { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

@ApiTags('Remote Execute')
@Controller('remote-execute')
@UseGuards(AuthGuard)
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
  runCommand(
    @Body() dto: RunCommandDto,
    @UserContext() user: UserContextPayload,
  ) {
    const result = this.remoteExecuteService.runCommand(
      dto.command,
      dto.sessionId,
      user,
    );

    return result;
  }

  @Sse('stream')
  @Doc({
    summary: 'Subscribe to remote-execute stream',
    description:
      'Server-Sent Events endpoint that streams commands published to the ' +
      'remote-execute channel for a specific sessionId in real-time. Each event is a JSON-encoded RemoteCommandPayload.',
  })
  stream(
    @Query('sessionId') sessionId: string,
    @UserContext() user: UserContextPayload,
  ): Observable<MessageEvent> {
    return this.remoteExecuteService.subscribeToStream(sessionId, user);
  }
}
