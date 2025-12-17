import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { TargetsService } from './targets.service';

describe('TargetsService', () => {
  let service: TargetsService;
  let mockTargetRepository: Partial<Repository<Target>>;
  let mockWorkspaceTargetRepository: Partial<Repository<WorkspaceTarget>>;
  let mockWorkspacesService: Partial<WorkspacesService>;
  let mockAssetsService: Partial<AssetsService>;
  let mockEventEmitter: Partial<EventEmitter2>;
  let mockQueue: Partial<Queue>;

  beforeEach(async () => {
    mockTargetRepository = {
      findOneBy: jest.fn(),
      upsert: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    } as any;

    mockWorkspaceTargetRepository = {
      findOneBy: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockWorkspacesService = {
      getWorkspaceByIdAndOwner: jest.fn(),
      getWorkspaceConfigValue: jest.fn(),
    } as any;

    mockAssetsService = {
      createPrimaryAsset: jest.fn(),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

    mockQueue = {
      add: jest.fn(),
      removeJobScheduler: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetsService,
        {
          provide: getRepositoryToken(Target),
          useValue: mockTargetRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceTarget),
          useValue: mockWorkspaceTargetRepository,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: AssetsService,
          useValue: mockAssetsService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: 'BullQueue_assets-discovery-schedule', // Queue name for BullMQ
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<TargetsService>(TargetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
