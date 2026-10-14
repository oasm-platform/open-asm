import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Template } from './entities/templates.entity';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templateRepo: Record<string, jest.Mock>;
  let storageService: Record<string, jest.Mock>;
  let workspacesService: Record<string, jest.Mock>;

  beforeEach(async () => {
    templateRepo = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };
    storageService = {
      getPresignedUploadUrl: jest.fn(),
      deleteFile: jest.fn(),
    };
    workspacesService = {
      getWorkspaceById: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: getRepositoryToken(Template),
          useValue: templateRepo,
        },
        {
          provide: WorkspacesService,
          useValue: workspacesService,
        },
        {
          provide: StorageService,
          useValue: storageService,
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

    service = module.get<TemplatesService>(TemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('presignTemplate', () => {
    const templateId = 'a1b2c3d4-0000-4000-8000-000000000000';

    beforeEach(() => {
      templateRepo.findOne.mockResolvedValue({
        id: templateId,
        workspace: { id: 'ws-1' },
      });
      storageService.getPresignedUploadUrl.mockResolvedValue({
        url: 'https://storage.test/nuclei-templates/x.yaml?sig=1',
        key: `${templateId}.yaml`,
        path: `nuclei-templates/${templateId}.yaml`,
        expiresIn: 900,
      });
    });

    it('presigns the deterministic yaml key and persists the path', async () => {
      const result = await service.presignTemplate(templateId, 'ws-1', {});

      expect(storageService.getPresignedUploadUrl).toHaveBeenCalledWith({
        bucket: 'nuclei-templates',
        key: `${templateId}.yaml`,
        contentType: 'text/yaml',
      });
      expect(templateRepo.update).toHaveBeenCalledWith(
        { id: templateId },
        { path: `nuclei-templates/${templateId}.yaml` },
      );
      expect(result).toEqual({
        uploadUrl: 'https://storage.test/nuclei-templates/x.yaml?sig=1',
        key: `${templateId}.yaml`,
        path: `nuclei-templates/${templateId}.yaml`,
        contentType: 'text/yaml',
        expiresIn: 900,
      });
    });

    it('rejects a template owned by another workspace', async () => {
      templateRepo.findOne.mockResolvedValue({
        id: templateId,
        workspace: { id: 'ws-other' },
      });

      await expect(
        service.presignTemplate(templateId, 'ws-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageService.getPresignedUploadUrl).not.toHaveBeenCalled();
      expect(templateRepo.update).not.toHaveBeenCalled();
    });
  });
});
