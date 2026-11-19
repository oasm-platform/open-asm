import { ActiveRunRegistry } from './active-run.registry';
import { UserId, WorkspaceId } from '@/common/decorators/app.decorator';
import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { GetManyResponseDto } from '@/common/utils/get-many-response.util';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { NodeResponse } from '@nestjs/platform-node';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsService } from './agents.service';
import { AgentsStreamBufferService } from './agents.stream-buffer';
import { WorkflowResponseDto } from './dto/workflow.dto';
import {
  SubagentDetailResponseDto,
  SubagentResponseDto,
} from './dto/conversation-stats.dto';
import {
  ConversationResponseDto,
  UpdateConversationDto,
} from './dto/conversation.dto';
import { MessageResponseDto, SendMessageDto } from './dto/message.dto';
import { isInvalidInput, isNotFound } from '@/common/errors/error-checks';

/** Longest a stopped run is still reported as running while it saves */
const STOP_SETTLE_TIMEOUT_MS = 30_000;

/** Resolves `ms` after the signal aborts; never resolves while it does not */
function afterAbort(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const start = () => setTimeout(resolve, ms).unref();
    if (signal.aborted) start();
    else signal.addEventListener('abort', start, { once: true });
  });
}

@ApiTags('Agents')
@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsCompletionsService: AgentsCompletionsService,
    private readonly agentsStreamBuffer: AgentsStreamBufferService,
    private readonly activeRuns: ActiveRunRegistry,
  ) {}

  // ==========================================
  // Conversation Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id')
  @Doc({
    summary: 'Get conversation detail',
    description: 'Get a single conversation with full details including todos',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: ConversationResponseDto },
  })
  async getConversation(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ConversationResponseDto> {
    return this.agentsService.getConversation(id, workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/subagents')
  @Doc({
    summary: 'List conversation subagents',
    description:
      'Background subagent tasks dispatched in this conversation, with status and result',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: SubagentResponseDto, isArray: true },
  })
  async getConversationSubagents(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SubagentResponseDto[]> {
    return this.agentsService.getConversationSubagents(
      id,
      workspaceId,
      userId,
    );
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/subagents/:subagentId')
  @Doc({
    summary: 'Get conversation subagent',
    description:
      'One subagent task with the transcript of its steps and tool calls',
    request: {
      getWorkspaceId: true,
      params: [
        { name: 'id', description: 'Conversation ID' },
        { name: 'subagentId', description: 'Subagent ID' },
      ],
    },
    response: { serialization: SubagentDetailResponseDto },
  })
  async getConversationSubagent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subagentId', ParseUUIDPipe) subagentId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<SubagentDetailResponseDto> {
    return this.agentsService.getConversationSubagent(
      id,
      subagentId,
      workspaceId,
      userId,
    );
  }

  @WorkspaceAccess('agent.write')
  @Post('conversations/:id/subagents/:subagentId/cancel')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Cancel a conversation subagent',
    description:
      'Stops one pending or running subagent. Subagents that wait for it start with its cancelled status.',
    request: {
      getWorkspaceId: true,
      params: [
        { name: 'id', description: 'Conversation ID' },
        { name: 'subagentId', description: 'Subagent ID' },
      ],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async cancelConversationSubagent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subagentId', ParseUUIDPipe) subagentId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    return this.agentsService.cancelConversationSubagent(
      id,
      subagentId,
      workspaceId,
      userId,
    );
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/workflow')
  @Doc({
    summary: 'Get conversation workflow',
    description:
      'Plan steps, the subagents dispatched for them with their dependencies and results, and the shared notebook',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: WorkflowResponseDto },
  })
  async getConversationWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<WorkflowResponseDto> {
    return this.agentsService.getConversationWorkflow(id, workspaceId, userId);
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations')
  @Doc({
    summary: 'List conversations',
    description: 'Get all conversations for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: GetManyResponseDto(ConversationResponseDto) },
  })
  async getConversations(
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ) {
    const result = await this.agentsService.getConversations(
      workspaceId,
      userId,
      query,
    );
    // Lets the chat list mark conversations whose run is still going
    const data = await Promise.all(
      result.data.map(async (conversation) => ({
        ...conversation,
        running:
          this.activeRuns.isActive(conversation.id) ||
          (await this.agentsStreamBuffer.isStreaming(conversation.id)),
      })),
    );
    return { ...result, data };
  }

  @WorkspaceAccess('agent.write')
  @Patch('conversations/:id')
  @Doc({
    summary: 'Update conversation',
    description: 'Update a conversation title',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: ConversationResponseDto },
  })
  async updateConversation(
    @Param() { id }: IdQueryParamDto,
    @Body() dto: UpdateConversationDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<ConversationResponseDto> {
    return this.agentsService.updateConversation(id, dto, workspaceId, userId);
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations')
  @Doc({
    summary: 'Delete all conversations',
    description:
      'Delete all conversations and their messages for the workspace',
    request: { getWorkspaceId: true },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteAllConversations(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteAllConversations(workspaceId, userId);
    return { message: 'All conversations deleted successfully' };
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations/:id')
  @Doc({
    summary: 'Delete conversation',
    description: 'Delete a conversation and all its messages',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteConversation(
    @Param() { id }: IdQueryParamDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteConversation(id, workspaceId, userId);
    return { message: 'Conversation deleted successfully' };
  }

  // ==========================================
  // Message / Chat Endpoints
  // ==========================================

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/messages')
  @Doc({
    summary: 'Get messages',
    description: 'Get all messages in a conversation',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: GetManyResponseDto(MessageResponseDto) },
  })
  async getMessages(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<
    GetManyBaseResponseDto<MessageResponseDto> & { running: boolean }
  > {
    // Lets a client that lost the stream keep polling until the whole run
    // ends, including the gaps between continuation iterations. Read before
    // the messages: `running: false` then means they were read after the
    // run saved its final state.
    const running = this.activeRuns.isActive(id);
    const result = await this.agentsService.getMessages(
      id,
      workspaceId,
      userId,
      query,
    );
    return { ...result, running };
  }

  @WorkspaceAccess('agent.read')
  @Post('messages/stream')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Send message (streaming)',
    description:
      'Send a message and receive a streaming response via SSE. ' +
      'If conversationId is not provided, a new conversation is created using the preferred LLM config.',
    request: { getWorkspaceId: true },
  })
  async streamMessage(
    @Body() dto: SendMessageDto,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Res() res: NodeResponse,
  ): Promise<void> {
    // The run outlives this HTTP request. A client disconnect (navigating to
    // another conversation/tab) must NOT kill it: we keep draining the stream
    // server-side so it finishes and persists, and the user sees the result on
    // return. Only an explicit stop (POST .../stop) aborts the run.
    const abortController = new AbortController();
    let clientGone = false;
    const canWrite = () => !clientGone && !res.writableEnded;

    // Listen on the response: the request already emitted 'close' once the
    // body parser consumed it, so a listener on req would never fire.
    const onClientDisconnect = () => {
      clientGone = true;
    };
    res.on('close', onClientDisconnect);

    let activeConversationId: string | undefined;
    let runSettled: Promise<void> | undefined;
    try {
      const { stream, conversationId, settled } =
        await this.agentsCompletionsService.streamMessage(
          dto,
          workspaceId,
          userId,
          abortController.signal,
        );
      activeConversationId = conversationId;
      runSettled = settled;
      if (conversationId) {
        this.activeRuns.register(
          conversationId,
          abortController,
        );
        // Start this run's resumable buffer from empty, discarding any left by
        // a previous run of the conversation.
        await this.agentsStreamBuffer.reset(conversationId);
      }

      if (canWrite()) {
        res.socket?.setNoDelay(true);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader(
          'X-Conversation-Id',
          conversationId || dto.conversationId || '',
        );
        res.flushHeaders();
      }

      // Headers are now committed — from this point on we can only write SSE events

      // SSE keepalive heartbeat: emit comment every 15s to prevent
      // proxy/load-balancer timeouts on long-running streams.
      const keepaliveInterval = setInterval(() => {
        if (canWrite()) {
          res.write(':keepalive\n\n');
        }
      }, 15_000);

      try {
        const reader = stream.getReader();
        while (true) {
          // An explicit stop cancels the run; a mere disconnect does not
          if (abortController.signal.aborted) {
            await reader.cancel();
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;
          const chunkJson = JSON.stringify(value);
          // Keep reading even after the client left, so the run reaches its
          // end and persists; just stop writing to the dead socket. Written
          // before buffering, so the live client never waits on Redis.
          if (canWrite()) {
            res.write(`data: ${chunkJson}\n\n`);
          }
          // Buffer every chunk so a reconnecting client can replay it. Await
          // to keep Redis order matching the write order; it swallows its own
          // errors, so it never breaks the live stream. Browser screenshots
          // are a live view: resumers get them as they come, but none is
          // kept, so Redis never holds every image of the run.
          if (activeConversationId) {
            if (
              (value as { type?: string }).type === 'data-browser-screenshot'
            ) {
              await this.agentsStreamBuffer.publishLive(
                activeConversationId,
                chunkJson,
              );
            } else {
              await this.agentsStreamBuffer.append(
                activeConversationId,
                chunkJson,
              );
            }
          }
        }
        // Send [DONE] marker to properly terminate the SSE stream
        if (canWrite()) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        if (abortController.signal.aborted || clientGone) {
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        const message =
          streamError instanceof Error
            ? streamError.message
            : typeof streamError === 'string'
              ? streamError
              : 'Stream error';
        if (canWrite()) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', error: { message } })}\n\n`,
          );
          res.end();
        }
      } finally {
        clearInterval(keepaliveInterval);
      }
    } catch (error) {
      if (clientGone) return;
      if (isInvalidInput(error)) {
        res.status(400).json({
          message: error.message,
          error: 'Bad Request',
          statusCode: 400,
        });
      } else {
        res.status(500).json({
          message:
            error instanceof Error ? error.message : 'Internal server error',
          error: 'Internal Server Error',
          statusCode: 500,
        });
      }
    } finally {
      res.off('close', onClientDisconnect);
      if (activeConversationId) {
        const conversationId = activeConversationId;
        // The reader loop has ended, so no more chunks will be appended: close
        // the resumable buffer so any reconnecting client stops waiting.
        void this.agentsStreamBuffer.finish(conversationId);
        const clear = () =>
          this.activeRuns.clear(
            conversationId,
            abortController,
          );
        // After a stop this request ends before the run has saved its stopped
        // state; keep reporting it as running until then, but not forever
        // (a tool may ignore the abort)
        if (runSettled) {
          void Promise.race([
            runSettled,
            afterAbort(abortController.signal, STOP_SETTLE_TIMEOUT_MS),
          ]).finally(clear);
        } else {
          clear();
        }
      }
    }
  }

  @WorkspaceAccess('agent.write')
  @Post('conversations/:id/stop')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Stop the active response',
    description:
      'Aborts the in-progress agent run of a conversation and cancels its pending ' +
      'and running subagents. Use this instead of dropping the stream connection, ' +
      'which now lets the run finish in the background.',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async stopConversation(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    // Ownership check (throws NotFound if the conversation is not the user's)
    await this.agentsService.getConversation(id, workspaceId, userId);
    const stopped = await this.agentsCompletionsService.stopRun(id);
    return { message: stopped ? 'Response stopped' : 'No active response' };
  }

  @WorkspaceAccess('agent.read')
  @Get('conversations/:id/stream')
  @Doc({
    summary: 'Resume the active response stream',
    description:
      'Reconnects to a run still producing the conversation\'s answer and ' +
      'streams the rest via SSE, replaying what was produced before the ' +
      'reconnect. Returns 204 when there is nothing to resume.',
    request: {
      getWorkspaceId: true,
      params: [{ name: 'id', description: 'Conversation ID' }],
    },
  })
  async resumeStream(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Res() res: NodeResponse,
  ): Promise<void> {
    // Ownership check. A chat started on the client has no row until its first
    // message is saved, so a missing conversation has nothing to resume: 204,
    // not 404, which the client would report as a stream error.
    try {
      await this.agentsService.getConversation(id, workspaceId, userId);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    const stream = await this.agentsStreamBuffer.createResumeStream(id, () =>
      this.activeRuns.isActive(id),
    );
    if (!stream) {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    const canWrite = () => !res.writableEnded;
    let clientGone = false;
    const onClientDisconnect = () => {
      clientGone = true;
    };
    res.on('close', onClientDisconnect);

    res.socket?.setNoDelay(true);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const keepaliveInterval = setInterval(() => {
      if (canWrite()) res.write(':keepalive\n\n');
    }, 15_000);

    const reader = stream.getReader();
    try {
      while (true) {
        if (clientGone) {
          await reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (canWrite()) res.write(`data: ${value}\n\n`);
      }
      if (canWrite()) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch {
      if (!res.writableEnded) res.end();
    } finally {
      clearInterval(keepaliveInterval);
      res.off('close', onClientDisconnect);
    }
  }

  @WorkspaceAccess('agent.write')
  @Delete('conversations/:cid/messages/:mid')
  @Doc({
    summary: 'Delete message',
    description: 'Delete a specific message in a conversation',
    request: {
      getWorkspaceId: true,
      params: [
        { name: 'cid', description: 'Conversation ID' },
        { name: 'mid', description: 'Message ID' },
      ],
    },
    response: { serialization: DefaultMessageResponseDto },
  })
  async deleteMessage(
    @Param('cid') conversationId: string,
    @Param('mid') messageId: string,
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<DefaultMessageResponseDto> {
    await this.agentsService.deleteMessage(
      conversationId,
      messageId,
      workspaceId,
      userId,
    );
    return { message: 'Message deleted successfully' };
  }
}
