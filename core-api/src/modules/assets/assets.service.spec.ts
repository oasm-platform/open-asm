import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Target } from '../targets/entities/target.entity';
import { TechnologyForwarderService } from '../technology/technology-forwarder.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AssetsService } from './assets.service';
import { Asset } from './entities/assets.entity';

describe('AssetsService', () => {
  let service: AssetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: getRepositoryToken(Asset),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Target),
          useClass: Repository,
        },
        {
          provide: 'EventEmitter2',
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: TechnologyForwarderService,
          useValue: {
            enrichTechnologies: jest.fn(),
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            getWorkspaceIdByTargetId: jest.fn(),
            getWorkspaceConfigValue: jest.fn(),
          },
        },
        {
          provide: 'DataSource',
          useValue: {
            createQueryBuilder: jest.fn(),
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
