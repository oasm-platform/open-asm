import { BullMQName } from '@/common/enums/enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetsService } from '../assets/assets.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Target } from './entities/target.entity';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { TargetsService } from './targets.service';

describe('TargetsService', () => {
  let service: TargetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetsService,
        {
          provide: getRepositoryToken(Target),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(WorkspaceTarget),
          useClass: Repository,
        },
        {
          provide: WorkspacesService,
          useValue: {
            getWorkspaceByIdAndOwner: jest.fn(),
            getWorkspaceConfigValue: jest.fn(),
          },
        },
        {
          provide: AssetsService,
          useValue: {
            createPrimaryAsset: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: `BullQueue_${BullMQName.SCAN_SCHEDULE}`,
          useValue: {
            add: jest.fn(),
            remove: jest.fn(),
            obliterate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TargetsService>(TargetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
