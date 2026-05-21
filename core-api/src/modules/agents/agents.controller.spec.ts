import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentsCompletionsService } from './agents.completions';

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
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAgentModes', () => {
    it('should return object with modes and workers', async () => {
      const result = await controller.getAgentModes();

      expect(result).toHaveProperty('modes');
      expect(result).toHaveProperty('workers');
      expect(Array.isArray(result.modes)).toBe(true);
      expect(result.modes.length).toBeGreaterThan(0);
      expect(result.modes[0]).toHaveProperty('id');
      expect(result.modes[0]).toHaveProperty('name');
      expect(result.modes[0]).toHaveProperty('description');
    });

    it('should contain ask mode', async () => {
      const result = await controller.getAgentModes();
      const askMode = result.modes.find((m) => m.id === 'ask');

      expect(askMode).toBeDefined();
      expect(askMode?.name).toBe('ask');
      expect(askMode?.description).toContain('security');
    });

    it('should call agentsService.getAgentModesWithWorkers', async () => {
      await controller.getAgentModes();

      expect(mockAgentsService.getAgentModesWithWorkers).toHaveBeenCalled();
    });
  });
});
