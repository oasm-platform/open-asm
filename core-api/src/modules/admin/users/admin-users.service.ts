import { SortOrder } from '@/common/dtos/get-many-base.dto';
import { Role } from '@/common/enums/enum';
import { User } from '@/modules/auth/entities/user.entity';
import { UserPresenceService } from '@/modules/auth/user-presence.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUserDto, GetManyAdminUsersDto } from './dto/admin-users.dto';

// Injection-safe sort column lookup: sortBy becomes a bare identifier.
const SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  email: 'email',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

/** Picks the admin-visible fields; anything else on the row stays server-side. */
export function toAdminUserDto(
  user: User,
  lastActiveAt: Date | null,
): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    role: user.role,
    banned: user.banned ?? null,
    banReason: user.banReason ?? null,
    banExpires: user.banExpires ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt,
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly presence: UserPresenceService,
  ) {}

  /**
   * Lists user accounts across the platform, or the members of one workspace
   * when `workspaceId` is set. Bot identities are system accounts, not
   * people, so they are left out.
   */
  public async getUsers(query: GetManyAdminUsersDto) {
    const { page, limit, sortOrder, search, workspaceId } = query;
    const sortBy = SORT_COLUMNS[query.sortBy] ?? 'createdAt';

    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .where('user.role != :bot', { bot: Role.BOT })
      .orderBy(
        `user.${sortBy}`,
        sortOrder === SortOrder.DESC ? 'DESC' : 'ASC',
      )
      .skip((page - 1) * limit)
      .take(limit);

    if (search?.trim()) {
      queryBuilder.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // EXISTS rather than a join: one row per user even if a membership row
    // were ever duplicated, so pagination and the total stay correct.
    if (workspaceId) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM workspace_members wm WHERE wm."userId" = user.id AND wm."workspaceId" = :workspaceId)',
        { workspaceId },
      );
    }

    const [users, total] = await queryBuilder.getManyAndCount();
    const lastActive = await this.presence.lastActiveAt(
      users.map((user) => user.id),
    );

    return getManyResponse({
      query,
      data: users.map((user) =>
        toAdminUserDto(user, lastActive.get(user.id) ?? null),
      ),
      total,
    });
  }

  public async getUser(id: string): Promise<AdminUserDto> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const lastActive = await this.presence.lastActiveAt([id]);
    return toAdminUserDto(user, lastActive.get(id) ?? null);
  }
}
