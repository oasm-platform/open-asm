/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import {
  AgentApprovalMode,
  AgentMode,
  WorkerScope,
} from '@/common/enums/enum';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsService } from './agents.service';
import { AgentTool } from './agents.tools';
import type { SendMessageDto } from './dto/message.dto';

const dto = {
  question: 'hi',
  workerId: 'worker-1',
  agentMode: AgentMode.ASK,
} as unknown as SendMessageDto;

function buildCompletions(allowed: boolean, agentConfig: unknown = null) {
  const conversationRepository = {
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const service = Object.assign(
    Object.create(AgentsCompletionsService.prototype),
    {
      llmConfigRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 'llm-1' }),
      },
      agentsConfig: {
        find: jest.fn().mockResolvedValue(agentConfig),
        getDefaultLLMConfig: jest.fn().mockResolvedValue({ id: 'llm-1' }),
      },
      conversationRepository,
      workersService: {
        isAgentWorkerForWorkspace: jest.fn().mockResolvedValue(allowed),
      },
    },
  );
  return { service, conversationRepository };
}

describe('worker scope enforcement', () => {
  describe('conversation creation', () => {
    it('rejects a worker that is not an agent worker of the workspace', async () => {
      const { service, conversationRepository } = buildCompletions(false);

      await expect(
        service.getOrCreateConversation(dto, 'ws-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        service.workersService.isAgentWorkerForWorkspace,
      ).toHaveBeenCalledWith('worker-1', 'ws-1');
      expect(conversationRepository.save).not.toHaveBeenCalled();
    });

    it('creates the conversation when the worker is allowed', async () => {
      const { service, conversationRepository } = buildCompletions(true);

      await service.getOrCreateConversation(dto, 'ws-1', 'user-1');

      expect(conversationRepository.save).toHaveBeenCalledTimes(1);
      expect(conversationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ workerId: 'worker-1', workspaceId: 'ws-1' }),
      );
    });

    it("uses the user's default approval mode when the request has none", async () => {
      const { service, conversationRepository } = buildCompletions(true, {
        defaultApprovalMode: AgentApprovalMode.AUTO,
      });

      await service.getOrCreateConversation(dto, 'ws-1', 'user-1');

      expect(conversationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          llmConfigId: 'llm-1',
          agentMode: AgentMode.ASK,
          approvalMode: AgentApprovalMode.AUTO,
        }),
      );
    });
  });

  describe('worker listings', () => {
    it('getAgentModesWithWorkers lists only workspace-scoped workers', async () => {
      const getWorkers = jest.fn().mockResolvedValue({ data: [] });
      const service = Object.assign(Object.create(AgentsService.prototype), {
        workersService: { getWorkers },
      }) as AgentsService;

      await service.getAgentModesWithWorkers('ws-1');

      expect(getWorkers).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: WorkerScope.WORKSPACE,
          workspaceId: 'ws-1',
        }),
      );
    });

    it('list_workers tool lists only workspace-scoped workers', async () => {
      const getWorkers = jest.fn().mockResolvedValue({ data: [] });
      const agentTool = Object.assign(Object.create(AgentTool.prototype), {
        workersService: { getWorkers },
      }) as AgentTool;

      const tool = agentTool.listWorkersTool('ws-1') as unknown as {
        execute: (params: unknown, options: unknown) => Promise<unknown>;
      };
      await tool.execute({}, {});

      expect(getWorkers).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: WorkerScope.WORKSPACE,
          workspaceId: 'ws-1',
        }),
      );
    });
  });
});
