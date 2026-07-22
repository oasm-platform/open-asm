import { UserContext } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { AuthGuard } from '@/common/guards/auth.guard';
import { UserContextPayload } from '@/common/interfaces/app.interface';
import type { MessageEvent } from '@nestjs/common';
import { Controller, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { RemoteExecuteService } from './remote-execute.service';

@ApiTags('Remote Execute')
@Controller('remote-execute')
@UseGuards(AuthGuard)
export class RemoteExecuteController {
  constructor(private readonly remoteExecuteService: RemoteExecuteService) {}

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
