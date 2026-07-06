import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentsCompletionsService } from './agents.completions';
import { AgentsSkillsService } from './agents.skills';

jest.mock('@/common/guards/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

describe('AgentsController', () => {
  let controller: AgentsController;
  let mockAgentsService: Partial<AgentsService>;

  beforeEach(async () => {
    mockAgentsService = {
      getAgentModesWithWorkers: jest.fn().mockResolvedValue({
        modes: [
          {
            id: 'ask',
            name: 'ask',
            description: 'Ask anything about security',
          },
        ],
        workers: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: AgentsCompletionsService,
          useValue: {},
        },
        {
          provide: AgentsSkillsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAgentModes', () => {
    const testWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return object with modes and workers', async () => {
      const result = await controller.getAgentModes(testWorkspaceId);

      expect(result).toHaveProperty('modes');
      expect(result).toHaveProperty('workers');
      expect(Array.isArray(result.modes)).toBe(true);
      expect(result.modes.length).toBeGreaterThan(0);
      expect(result.modes[0]).toHaveProperty('id');
      expect(result.modes[0]).toHaveProperty('name');
      expect(result.modes[0]).toHaveProperty('description');
    });

    it('should contain ask mode', async () => {
      const result = await controller.getAgentModes(testWorkspaceId);
      const askMode = result.modes.find((m) => m.id === 'ask');

      expect(askMode).toBeDefined();
      expect(askMode?.name).toBe('ask');
      expect(askMode?.description).toContain('security');
    });

    it('should call agentsService.getAgentModesWithWorkers with workspaceId', async () => {
      await controller.getAgentModes(testWorkspaceId);

      expect(
        mockAgentsService.getAgentModesWithWorkers,
      ).toHaveBeenCalledWith(testWorkspaceId);
    });
  });
});
