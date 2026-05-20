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
      getAgentModes: jest.fn().mockReturnValue([
        {
          id: 'ask',
          name: 'ask',
          description: 'Ask anything about security',
        },
      ]),
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
    it('should return array of modes', () => {
      const modes = controller.getAgentModes();

      expect(Array.isArray(modes)).toBe(true);
      expect(modes.length).toBeGreaterThan(0);
      expect(modes[0]).toHaveProperty('id');
      expect(modes[0]).toHaveProperty('name');
      expect(modes[0]).toHaveProperty('description');
    });

    it('should contain ask mode', () => {
      const modes = controller.getAgentModes();
      const askMode = modes.find((m) => m.id === 'ask');

      expect(askMode).toBeDefined();
      expect(askMode?.name).toBe('ask');
      expect(askMode?.description).toContain('security');
    });

    it('should call agentsService.getAgentModes', () => {
      controller.getAgentModes();

      expect(mockAgentsService.getAgentModes).toHaveBeenCalled();
    });
  });
});
