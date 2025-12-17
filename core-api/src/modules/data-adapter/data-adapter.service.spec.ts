import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DataAdapterService } from './data-adapter.service';

describe('DataAdapterService', () => {
  let service: DataAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAdapterService,
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnThis(),
            getRepository: jest.fn().mockReturnThis(),
            query: jest.fn(),
            transaction: jest.fn(),
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            getWorkspaceIdByTargetId: jest.fn(),
            getWorkspaceConfigValue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataAdapterService>(DataAdapterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
