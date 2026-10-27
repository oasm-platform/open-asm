import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminUsersService } from './admin-users.service';
import { GetManyAdminUsersDto } from './dto/admin-users.dto';

const userRow = {
  id: 'user-1',
  name: 'Jane',
  email: 'jane@example.com',
  emailVerified: true,
  image: undefined,
  role: Role.USER,
  language: 'en',
  banned: undefined,
  banReason: undefined,
  banExpires: undefined,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
} as unknown as User;

const query = (overrides: Partial<GetManyAdminUsersDto> = {}) =>
  Object.assign(new GetManyAdminUsersDto(), overrides);

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let queryBuilder: Record<string, jest.Mock>;
  let usersRepository: { createQueryBuilder: jest.Mock; findOneBy: jest.Mock };

  beforeEach(async () => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[userRow], 1]),
    };
    usersRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOneBy: jest.fn().mockResolvedValue(userRow),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
      ],
    }).compile();

    service = module.get(AdminUsersService);
  });

  describe('getUsers', () => {
    it('excludes bots, paginates and returns only admin-visible fields', async () => {
      const result = await service.getUsers(query({ page: 2, limit: 5 }));

      expect(queryBuilder.where).toHaveBeenCalledWith('user.role != :bot', {
        bot: Role.BOT,
      });
      expect(queryBuilder.skip).toHaveBeenCalledWith(5);
      expect(queryBuilder.take).toHaveBeenCalledWith(5);
      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
      expect(result).toMatchObject({ total: 1, page: 2, limit: 5 });
      expect(result.data[0]).not.toHaveProperty('language');
      expect(result.data[0]).toMatchObject({
        id: 'user-1',
        email: 'jane@example.com',
        role: Role.USER,
        banned: null,
      });
    });

    it('searches name and email with a trimmed term', async () => {
      await service.getUsers(query({ search: '  jane ' }));

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.name ILIKE :search OR user.email ILIKE :search)',
        { search: '%jane%' },
      );
    });

    it('narrows to the members of a workspace', async () => {
      await service.getUsers(query({ workspaceId: 'ws-1' }));

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('FROM workspace_members wm'),
        { workspaceId: 'ws-1' },
      );
    });

    it('sorts by an allow-listed column', async () => {
      await service.getUsers(
        query({ sortBy: 'email', sortOrder: SortOrder.DESC }),
      );

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('user.email', 'DESC');
    });

    it('falls back to createdAt for a column outside the allow-list', async () => {
      await service.getUsers(query({ sortBy: 'banReason' }));

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'user.createdAt',
        'ASC',
      );
    });
  });

  describe('getUser', () => {
    it('returns the user', async () => {
      await expect(service.getUser('user-1')).resolves.toMatchObject({
        id: 'user-1',
        name: 'Jane',
      });
      expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: 'user-1' });
    });

    it('throws NotFound for an unknown id', async () => {
      usersRepository.findOneBy.mockResolvedValue(null);

      await expect(service.getUser('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
