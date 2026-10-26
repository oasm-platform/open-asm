import { Role } from '@/common/enums/enum';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let usersRepository: { count: jest.Mock; update: jest.Mock };
  let authApi: { signUpEmail: jest.Mock; signInEmail: jest.Mock };

  beforeEach(async () => {
    usersRepository = {
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    };
    authApi = {
      signUpEmail: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
      signInEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: AuthService, useValue: { api: authApi } },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  describe('createFirstAdmin', () => {
    const dto = { email: 'admin@example.com', password: 'secret-password' };

    it('signs up the user and promotes it to a verified admin', async () => {
      const result = await service.createFirstAdmin(dto);

      expect(usersRepository.count).toHaveBeenCalledWith({
        where: { role: Role.ADMIN },
      });
      expect(authApi.signUpEmail).toHaveBeenCalledWith({
        body: { name: 'Admin', ...dto },
      });
      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        role: Role.ADMIN,
        emailVerified: true,
      });
      expect(result).toEqual({ message: 'Admin user created successfully' });
    });

    it('refuses once an admin already exists', async () => {
      usersRepository.count.mockResolvedValue(1);

      await expect(service.createFirstAdmin(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(authApi.signUpEmail).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });
  });
});
