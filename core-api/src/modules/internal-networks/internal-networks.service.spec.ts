import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { CreateInternalNetworkDto } from './dtos/create-internal-network.dto';
import type { GetManyInternalNetworksQueryDto } from './dtos/get-many-internal-networks.dto';
import type {
  GetManyNetworkInterfacesQueryDto,
} from './dtos/get-many-network-interfaces.dto';
import type { UpdateInternalNetworkDto } from './dtos/update-internal-network.dto';
import { InternalNetwork } from './entities/internal-network.entity';
import { NetworkInterface } from './entities/network-interface.entity';
import { InternalNetworksService } from './internal-networks.service';
import { SortOrder } from '@/common/dtos/get-many-base.dto';

describe('InternalNetworksService', () => {
  let service: InternalNetworksService;
  let internalNetworkRepo: Repository<InternalNetwork>;
  let networkInterfaceRepo: Repository<NetworkInterface>;
  let workspacesService: WorkspacesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalNetworksService,
        {
          provide: getRepositoryToken(InternalNetwork),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(NetworkInterface),
          useClass: Repository,
        },
        {
          provide: WorkspacesService,
          useValue: {
            getWorkspaceByIdAndOwner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InternalNetworksService>(InternalNetworksService);
    internalNetworkRepo = module.get<Repository<InternalNetwork>>(
      getRepositoryToken(InternalNetwork),
    );
    networkInterfaceRepo = module.get<Repository<NetworkInterface>>(
      getRepositoryToken(NetworkInterface),
    );
    workspacesService = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInternalNetwork', () => {
    it('should create internal network successfully', async () => {
      const dto: CreateInternalNetworkDto = {
        name: 'Test Network',
      };
      const workspaceId = randomUUID();
      const user = { id: randomUUID() };
      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockResolvedValue({} as any);
      jest.spyOn(internalNetworkRepo, 'save').mockResolvedValue({} as any);

      const result = await service.createInternalNetwork(
        dto,
        workspaceId,
        user as any,
      );

      expect(result).toEqual({
        message: 'Internal network created successfully',
      });
      expect(workspacesService.getWorkspaceByIdAndOwner).toHaveBeenCalledWith(
        workspaceId,
        user,
      );
    });

    it('should throw ForbiddenException if workspace not found or not owner', async () => {
      const dto: CreateInternalNetworkDto = {
        name: 'Test Network',
      };
      const workspaceId = randomUUID();
      const user = { id: randomUUID() };

      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockRejectedValue(
          new ForbiddenException('You are not the owner of this workspace'),
        );

      await expect(
        service.createInternalNetwork(dto, workspaceId, user as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const dto: CreateInternalNetworkDto = {
        name: 'Test Network',
      };
      const workspaceId = randomUUID();
      const user = { id: randomUUID() };

      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockRejectedValue(
          new ForbiddenException('You are not the owner of this workspace'),
        );

      await expect(
        service.createInternalNetwork(dto, workspaceId, user as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateInternalNetworkById', () => {
    it('should update internal network successfully', async () => {
      const id = randomUUID();
      const dto: UpdateInternalNetworkDto = { name: 'Updated Network' };
      const user = { id: randomUUID() };
      const internalNetwork = {
        id,
        name: 'Old Name',
        workspace: { owner: { id: user.id } },
      };

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockResolvedValue({} as any);
      jest
        .spyOn(internalNetworkRepo, 'save')
        .mockResolvedValue(internalNetwork as any);

      const result = await service.updateInternalNetworkById(
        id,
        dto,
        user as any,
      );

      expect(result).toEqual({
        message: 'Internal network updated successfully',
      });
      expect(internalNetwork.name).toBe(dto.name);
    });

    it('should throw NotFoundException if internal network not found', async () => {
      const id = randomUUID();
      const dto: UpdateInternalNetworkDto = { name: 'Updated Network' };
      const user = { id: randomUUID() };

      jest.spyOn(internalNetworkRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateInternalNetworkById(id, dto, user as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const id = randomUUID();
      const dto: UpdateInternalNetworkDto = { name: 'Updated Network' };
      const user = { id: randomUUID() };
      const internalNetwork = {
        id,
        workspaceId: randomUUID(),
        workspace: { owner: { id: randomUUID() } },
      };

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockRejectedValue(
          new ForbiddenException('You are not the owner of this workspace'),
        );

      await expect(
        service.updateInternalNetworkById(id, dto, user as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteInternalNetwork', () => {
    it('should delete internal network successfully', async () => {
      const id = randomUUID();
      const user = { id: randomUUID() };
      const internalNetwork = {
        id,
        workspace: { owner: { id: user.id } },
      };

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockResolvedValue({} as any);
      jest
        .spyOn(internalNetworkRepo, 'remove')
        .mockResolvedValue(internalNetwork as any);

      const result = await service.deleteInternalNetwork(id, user as any);

      expect(result).toEqual({
        message: 'Internal network deleted successfully',
      });
    });

    it('should throw NotFoundException if internal network not found', async () => {
      const id = randomUUID();
      const user = { id: randomUUID() };

      jest.spyOn(internalNetworkRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.deleteInternalNetwork(id, user as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const id = randomUUID();
      const user = { id: randomUUID() };
      const internalNetwork = {
        id,
        workspaceId: randomUUID(),
        workspace: { owner: { id: randomUUID() } },
      };

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(workspacesService, 'getWorkspaceByIdAndOwner')
        .mockRejectedValue(
          new ForbiddenException('You are not the owner of this workspace'),
        );

      await expect(
        service.deleteInternalNetwork(id, user as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getManyInternalNetworks', () => {
    it('should return paginated internal networks for workspace', async () => {
      const query: GetManyInternalNetworksQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };
      const workspaceId = randomUUID();
      const networks = [
        {
          id: randomUUID(),
          name: 'Network 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: { id: randomUUID(), name: 'User 1', image: 'image1.jpg' },
        },
      ];
      const total = 1;

      jest
        .spyOn(internalNetworkRepo, 'findAndCount')
        .mockResolvedValue([networks as any, total]);

      const result = await service.getManyInternalNetworks(query, workspaceId);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(total);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(internalNetworkRepo.findAndCount).toHaveBeenCalledWith({
        where: { workspaceId },
        relations: ['creator'],
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by search on name when provided', async () => {
      const query: GetManyInternalNetworksQueryDto = {
        search: 'Test',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };
      const workspaceId = randomUUID();

      jest
        .spyOn(internalNetworkRepo, 'findAndCount')
        .mockResolvedValue([[], 0]);

      await service.getManyInternalNetworks(query, workspaceId);

      expect(internalNetworkRepo.findAndCount).toHaveBeenCalledWith({
        where: { workspaceId, name: expect.any(Object) }, // Like pattern
        relations: ['creator'],
        order: { createdAt: SortOrder.ASC },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('getManyNetworkInterfaces', () => {
    it('should return paginated network interfaces for internal network', async () => {
      const internalNetworkId = randomUUID();
      const workspaceId = randomUUID();
      const query: GetManyNetworkInterfacesQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      };
      const internalNetwork = { id: internalNetworkId, workspaceId };
      const interfaces = [
        {
          id: randomUUID(),
          interfaceName: 'eth0',
          ipAddress: '192.168.1.10',
          cidr: '24',
          gatewayIp: '192.168.1.1',
          gatewayMac: 'aa:bb:cc:dd:ee:ff',
          workerId: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const total = 1;

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(networkInterfaceRepo, 'findAndCount')
        .mockResolvedValue([interfaces as any, total]);

      const result = await service.getManyNetworkInterfaces(
        internalNetworkId,
        query,
        workspaceId,
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(total);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(internalNetworkRepo.findOne).toHaveBeenCalledWith({
        where: { id: internalNetworkId, workspaceId },
      });
      expect(networkInterfaceRepo.findAndCount).toHaveBeenCalledWith({
        where: { internalNetworkId },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by search on interfaceName when provided', async () => {
      const internalNetworkId = randomUUID();
      const workspaceId = randomUUID();
      const query: GetManyNetworkInterfacesQueryDto = {
        search: 'eth',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };
      const internalNetwork = { id: internalNetworkId, workspaceId };

      jest
        .spyOn(internalNetworkRepo, 'findOne')
        .mockResolvedValue(internalNetwork as any);
      jest
        .spyOn(networkInterfaceRepo, 'findAndCount')
        .mockResolvedValue([[], 0]);

      await service.getManyNetworkInterfaces(
        internalNetworkId,
        query,
        workspaceId,
      );

      expect(networkInterfaceRepo.findAndCount).toHaveBeenCalledWith({
        where: { internalNetworkId, interfaceName: expect.any(Object) }, // Like pattern
        order: { createdAt: SortOrder.ASC },
        skip: 0,
        take: 10,
      });
    });

    it('should throw NotFoundException if internal network not found', async () => {
      const internalNetworkId = randomUUID();
      const workspaceId = randomUUID();
      const query: GetManyNetworkInterfacesQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: SortOrder.ASC,
      };

      jest.spyOn(internalNetworkRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getManyNetworkInterfaces(internalNetworkId, query, workspaceId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getInternalNetworkById', () => {
    it('should return internal network when found', async () => {
      const id = randomUUID();
      const workspaceId = randomUUID();
      const network = {
        id,
        name: 'Test Network',
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: { id: randomUUID(), name: 'User', image: 'img.jpg' },
      };

      jest.spyOn(internalNetworkRepo, 'findOne').mockResolvedValue(network as any);

      const result = await service.getInternalNetworkById(id, workspaceId);

      expect(result).toEqual({
        id: network.id,
        name: network.name,
        createdAt: network.createdAt,
        updatedAt: network.updatedAt,
        createdBy: {
          id: network.creator.id,
          name: network.creator.name,
          image: network.creator.image,
        },
      });
      expect(internalNetworkRepo.findOne).toHaveBeenCalledWith({
        where: { id, workspaceId },
        relations: ['creator'],
      });
    });

    it('should throw NotFoundException if internal network not found', async () => {
      const id = randomUUID();
      const workspaceId = randomUUID();

      jest.spyOn(internalNetworkRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getInternalNetworkById(id, workspaceId)).rejects.toThrow(NotFoundException);
    });
  });
});
