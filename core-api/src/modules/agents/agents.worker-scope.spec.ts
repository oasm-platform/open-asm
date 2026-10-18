/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException } from '@nestjs/common';
import {
  AgentApprovalMode,
  AgentMode,
  WorkerScope,
  WorkerType,
} from '@/common/enums/enum';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsService } from './agents.service';
import { listWorkersTool } from './tools/workspace.tools';
import type { SendMessageDto } from './dto/message.dto';

const dto = {
  question: 'hi',
  workerId: 'worker-1',
  agentMode: AgentMode.ASK,
} as unknown as SendMessageDto;

function buildCompletions(
  allowed: boolean,
  agentConfig: unknown = null,
  online = true,
) {
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
      remoteExecuteSubscribe: {
        isAgentReady: jest.fn().mockReturnValue(online),
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

    it('rejects an allowed worker that is offline', async () => {
      const { service, conversationRepository } = buildCompletions(
        true,
        null,
        false,
      );

      await expect(
        service.getOrCreateConversation(dto, 'ws-1', 'user-1'),
      ).rejects.toThrow('Worker is offline');
      expect(
        service.remoteExecuteSubscribe.isAgentReady,
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
    it('getAgentModesWithWorkers lists the workspace and global agent workers, own first', async () => {
      const getWorkers = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'g1',
            name: 'global',
            scope: WorkerScope.CLOUD,
            type: WorkerType.BUILT_IN,
          },
          { id: 'w1', name: 'own', scope: WorkerScope.WORKSPACE },
        ],
      });
      const service = Object.assign(Object.create(AgentsService.prototype), {
        workersService: { getWorkers },
        remoteExecuteSubscribe: { isAgentReady: () => true },
      }) as AgentsService;

      const result = await service.getAgentModesWithWorkers('ws-1');

      expect(getWorkers).toHaveBeenCalledWith(
        expect.objectContaining({ enabledAgentMode: true }),
        { agentWorkspaceId: 'ws-1' },
      );
      expect(getWorkers.mock.calls[0][0]).not.toHaveProperty('scope');
      expect(result.workers.map((w) => w.id)).toEqual(['w1', 'g1']);
    });

    it('getAgentModesWithWorkers leaves out offline workers', async () => {
      const getWorkers = jest.fn().mockResolvedValue({
        data: [
          { id: 'w-online', name: 'up', scope: WorkerScope.WORKSPACE },
          { id: 'w-offline', name: 'down', scope: WorkerScope.WORKSPACE },
        ],
      });
      const isAgentReady = jest.fn((id: string) => id === 'w-online');
      const service = Object.assign(Object.create(AgentsService.prototype), {
        workersService: { getWorkers },
        remoteExecuteSubscribe: { isAgentReady },
      }) as AgentsService;

      const result = await service.getAgentModesWithWorkers('ws-1');

      expect(result.workers.map((w) => w.id)).toEqual(['w-online']);
      expect(isAgentReady).toHaveBeenCalledWith('w-offline', 'ws-1');
    });

    it('list_workers tool lists the workspace and global agent workers', async () => {
      const getWorkers = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'g1',
            name: 'global',
            scope: WorkerScope.CLOUD,
            type: WorkerType.BUILT_IN,
          },
        ],
      });
      const tool = listWorkersTool(
        { workersService: { getWorkers } } as never,
        'ws-1',
      ) as unknown as {
        execute: (params: unknown, options: unknown) => Promise<unknown>;
      };
      const result = (await tool.execute({}, {})) as {
        data: Array<{ id: string; scope: string }>;
      };

      expect(getWorkers).toHaveBeenCalledWith(
        expect.objectContaining({ enabledAgentMode: true }),
        { agentWorkspaceId: 'ws-1' },
      );
      expect(result.data).toEqual([
        { id: 'g1', name: 'global', scope: 'global' },
      ]);
    });
  });
});
