import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkspaceTarget } from '../targets/entities/workspace-target.entity';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkspaceMembers } from './entities/workspace-members.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let mockWorkspaceRepository: Partial<Repository<Workspace>>;
  let mockWorkspaceMembersRepository: Partial<Repository<WorkspaceMembers>>;
  let mockWorkspaceTargetRepository: Partial<Repository<WorkspaceTarget>>;
  let mockApiKeysService: Partial<ApiKeysService>;
  let mockNotificationsService: Partial<NotificationsService>;
  let mockDataSource: Partial<DataSource>;

  beforeEach(async () => {
    mockWorkspaceRepository = {
      count: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getManyAndCount: jest.fn(),
      getOne: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as any;

    mockWorkspaceMembersRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    } as any;

    mockWorkspaceTargetRepository = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    } as any;

    mockApiKeysService = {
      create: jest.fn(),
      getCurrentApiKey: jest.fn(),
    } as any;

    mockNotificationsService = {
      createNotification: jest.fn(),
    } as any;

    mockDataSource = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockWorkspaceRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceMembers),
          useValue: mockWorkspaceMembersRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceTarget),
          useValue: mockWorkspaceTargetRepository,
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: WorkflowsService,
          useValue: {
            createDefaultWorkflows: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
