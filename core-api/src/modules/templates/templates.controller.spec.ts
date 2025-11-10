import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Template } from './entities/templates.entity';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

describe('TemplatesController', () => {
  let controller: TemplatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        TemplatesService,
        {
          provide: getRepositoryToken(Template),
          useClass: Repository,
        },
        {
          provide: WorkspacesService,
          useValue: {
            getWorkspaceById: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
            deleteFile: jest.fn(),
          },
        },
        {
          provide: JobsRegistryService,
          useValue: {
            createNewJob: jest.fn(),
          },
        },
        {
          provide: ToolsService,
          useValue: {
            getToolByNames: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
