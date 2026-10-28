import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminWorkspacesService } from './admin-workspaces.service';
import { GetManyAdminWorkspacesDto } from './dto/admin-workspaces.dto';

const owner = {
  id: 'user-1',
  name: 'Jane',
  email: 'jane@example.com',
  image: undefined,
  role: 'user',
};

const workspaceRow = {
  id: 'ws-1',
  name: 'Acme',
  description: undefined,
  owner,
  isAssetsDiscovery: true,
  isAutoEnableAssetAfterDiscovered: false,
  archivedAt: null,
  dek: 'encrypted-dek',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
} as unknown as Workspace;

const query = (overrides: Partial<GetManyAdminWorkspacesDto> = {}) =>
  Object.assign(new GetManyAdminWorkspacesDto(), overrides);

describe('AdminWorkspacesService', () => {
  let service: AdminWorkspacesService;
  let queryBuilder: Record<string, jest.Mock>;
  let workspacesRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    query: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[workspaceRow], 1]),
    };
    workspacesRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn().mockResolvedValue(workspaceRow),
      findOneBy: jest.fn().mockResolvedValue(workspaceRow),
      update: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValue([{ id: 'ws-1', targetCount: 3, memberCount: 2 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminWorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: workspacesRepository,
        },
      ],
    }).compile();

    service = module.get(AdminWorkspacesService);
  });

  describe('getWorkspaces', () => {
    it('lists workspaces with owner and counts, without secrets', async () => {
      const result = await service.getWorkspaces(query({ page: 1, limit: 10 }));

      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'workspace.owner',
        'owner',
      );
      expect(workspacesRepository.query).toHaveBeenCalledWith(
        expect.any(String),
        [['ws-1']],
      );
      expect(result.total).toBe(1);
      expect(result.data[0]).toEqual({
        id: 'ws-1',
        name: 'Acme',
        description: null,
        owner: {
          id: 'user-1',
          name: 'Jane',
          email: 'jane@example.com',
          image: null,
        },
        isAssetsDiscovery: true,
        isAutoEnableAssetAfterDiscovered: false,
        targetCount: 3,
        memberCount: 2,
        archivedAt: null,
        createdAt: workspaceRow.createdAt,
        updatedAt: workspaceRow.updatedAt,
      });
    });

    it('skips the counts query when the page is empty', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getWorkspaces(query());

      expect(workspacesRepository.query).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });

    it('searches workspace name and owner name/email', async () => {
      await service.getWorkspaces(query({ search: ' acme ' }));

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(workspace.name ILIKE :search OR owner.name ILIKE :search OR owner.email ILIKE :search)',
        { search: '%acme%' },
      );
    });

    it.each([
      [true, 'workspace.archivedAt IS NOT NULL'],
      [false, 'workspace.archivedAt IS NULL'],
    ])('filters isArchived=%s', async (isArchived, condition) => {
      await service.getWorkspaces(query({ isArchived }));

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(condition);
    });

    it('falls back to createdAt for a column outside the allow-list', async () => {
      await service.getWorkspaces(
        query({ sortBy: 'dek', sortOrder: SortOrder.DESC }),
      );

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'workspace.createdAt',
        'DESC',
      );
    });
  });

  describe('getWorkspace', () => {
    it('returns the workspace with its owner and counts, without members', async () => {
      workspacesRepository.findOne.mockResolvedValue(workspaceRow);

      const result = await service.getWorkspace('ws-1');

      // Members are paginated through GET /admin/users?workspaceId=, so the
      // detail query must not load the whole membership.
      expect(workspacesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        relations: { owner: true },
      });
      expect(result).not.toHaveProperty('dek');
      expect(result).not.toHaveProperty('members');
      expect(result).toMatchObject({
        id: 'ws-1',
        owner: { id: 'user-1', email: 'jane@example.com' },
        targetCount: 3,
        memberCount: 2,
      });
    });

    it('throws NotFound for an unknown id', async () => {
      workspacesRepository.findOne.mockResolvedValue(null);

      await expect(service.getWorkspace('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateWorkspace', () => {
    it('writes only the fields that were sent and returns the workspace', async () => {
      const result = await service.updateWorkspace('ws-1', {
        name: 'Renamed',
        isAssetsDiscovery: false,
      });

      expect(workspacesRepository.update).toHaveBeenCalledWith(
        { id: 'ws-1' },
        { name: 'Renamed', isAssetsDiscovery: false },
      );
      expect(result).toMatchObject({ id: 'ws-1' });
      expect(result).not.toHaveProperty('dek');
    });

    it('skips the write when nothing was sent', async () => {
      await service.updateWorkspace('ws-1', {});

      expect(workspacesRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFound before writing for an unknown id', async () => {
      workspacesRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateWorkspace('missing', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(workspacesRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('setArchived', () => {
    it('archives an active workspace', async () => {
      await service.setArchived('ws-1', true);

      expect(workspacesRepository.update).toHaveBeenCalledWith(
        { id: 'ws-1' },
        { archivedAt: expect.any(Date) },
      );
    });

    it('restores an archived workspace', async () => {
      workspacesRepository.findOneBy.mockResolvedValue({
        ...workspaceRow,
        archivedAt: new Date('2026-02-01T00:00:00Z'),
      });

      await service.setArchived('ws-1', false);

      expect(workspacesRepository.update).toHaveBeenCalledWith(
        { id: 'ws-1' },
        { archivedAt: null },
      );
    });

    it('keeps the original archivedAt when already archived', async () => {
      workspacesRepository.findOneBy.mockResolvedValue({
        ...workspaceRow,
        archivedAt: new Date('2026-02-01T00:00:00Z'),
      });

      await service.setArchived('ws-1', true);

      expect(workspacesRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown id', async () => {
      workspacesRepository.findOneBy.mockResolvedValue(null);

      await expect(service.setArchived('missing', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
