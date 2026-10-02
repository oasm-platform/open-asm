import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ToolProvider } from './entities/provider.entity';
import { ProvidersService } from './providers.service';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let mockProvidersRepository: Partial<Repository<ToolProvider>>;

  beforeEach(async () => {
    mockProvidersRepository = {
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        {
          provide: getRepositoryToken(ToolProvider),
          useValue: mockProvidersRepository,
        },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProviderById', () => {
    const owner = {
      id: 'user-1',
      name: 'Owner',
      image: null,
      email: 'owner@example.com',
      role: 'user',
      banned: false,
      banReason: null,
      emailVerified: true,
    };

    it('rejects a provider owned by another user', async () => {
      (mockProvidersRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        owner: { ...owner, id: 'someone-else' },
      });

      await expect(
        service.getProviderById('provider-1', { id: 'user-1' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a missing provider', async () => {
      (mockProvidersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getProviderById('provider-1', { id: 'user-1' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('exposes only id, name and image of the owner', async () => {
      (mockProvidersRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        name: 'Acme',
        owner,
      });

      const result = await service.getProviderById('provider-1', {
        id: 'user-1',
      } as any);

      expect(result.owner).toEqual({
        id: 'user-1',
        name: 'Owner',
        image: null,
      });
      expect(result.owner).not.toHaveProperty('email');
      expect(result.owner).not.toHaveProperty('role');
      expect(result.owner).not.toHaveProperty('banned');
      expect(result.owner).not.toHaveProperty('banReason');
      expect(result.owner).not.toHaveProperty('emailVerified');
    });
  });
});
