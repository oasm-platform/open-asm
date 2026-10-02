import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { StorageService } from '../storage/storage.service';
import { ToolsService } from '../tools/tools.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { Template } from './entities/templates.entity';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templateRepo: Record<string, jest.Mock>;
  let storageService: { uploadFile: jest.Mock; deleteFile: jest.Mock };
  let workspacesService: { getWorkspaceById: jest.Mock };

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
    storageService = { uploadFile: jest.fn(), deleteFile: jest.fn() };
    workspacesService = { getWorkspaceById: jest.fn() };

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

  describe('uploadFile', () => {
    it('refuses to upload when the template belongs to another workspace', async () => {
      workspacesService.getWorkspaceById.mockResolvedValue({ id: 'ws-a' });
      templateRepo.findOne.mockResolvedValue({
        id: 'tpl-1',
        path: null,
        workspace: { id: 'ws-b' },
      });

      await expect(
        service.uploadFile('tpl-1', 'ws-a', { id: 'user-1' } as never, 'p'),
      ).rejects.toThrow('Template does not belong to this workspace');

      expect(storageService.uploadFile).not.toHaveBeenCalled();
    });

    it('refuses to upload when the caller is not a member of the workspace', async () => {
      workspacesService.getWorkspaceById.mockRejectedValue(
        new NotFoundException('Workspace not found'),
      );

      await expect(
        service.uploadFile('tpl-1', 'ws-a', { id: 'user-1' } as never, 'p'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storageService.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads for a template owned by the authorized workspace', async () => {
      workspacesService.getWorkspaceById.mockResolvedValue({ id: 'ws-a' });
      templateRepo.findOne.mockResolvedValue({
        id: 'tpl-1',
        path: null,
        workspace: { id: 'ws-a' },
      });
      storageService.uploadFile.mockResolvedValue({
        path: 'nuclei-templates/tpl-1.yaml',
      });

      const result = await service.uploadFile(
        'tpl-1',
        'ws-a',
        { id: 'user-1' } as never,
        'payload',
      );

      expect(storageService.uploadFile).toHaveBeenCalledWith(
        'tpl-1.yaml',
        Buffer.from('payload', 'utf-8'),
        'nuclei-templates',
      );
      expect(result).toEqual({ path: 'nuclei-templates/tpl-1.yaml' });
    });
  });
});