import { BullModule } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';

describe('TargetsController', () => {
  let controller: TargetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.registerQueue({
          name: 'scan-schedule',
        }),
      ],
      controllers: [TargetsController],
      providers: [
        TargetsService,
        {
          provide: 'TargetRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
        {
          provide: 'WorkspaceTargetRepository',
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findOneBy: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: 'AssetsService',
          useValue: {
            createPrimaryAsset: jest.fn(),
            getManyAsssets: jest.fn(),
            getAssetById: jest.fn(),
          },
        },
        {
          provide: 'WorkspacesService',
          useValue: {
            getWorkspaceByIdAndOwner: jest.fn(),
            getWorkspaceConfigValue: jest.fn(),
          },
        },
        {
          provide: 'EventEmitter2',
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: 'Queue',
          useValue: {
            add: jest.fn(),
            remove: jest.fn(),
            obliterate: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TargetsController>(TargetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
