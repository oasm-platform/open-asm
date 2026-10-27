import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { Role } from '@/common/enums/enum';
import { AuthService } from '@/modules/auth/auth.service';
import { User } from '@/modules/auth/entities/user.entity';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFirstAdminDto } from './dto/admin.dto';

const FIRST_ADMIN_LOCK_KEY = 'admin-init';
// Only bounds how long a crashed holder blocks retries; withLock releases
// as soon as the bootstrap settles.
const FIRST_ADMIN_LOCK_TTL = 60_000;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly redisLockService: RedisLockService,
  ) {}

  /**
   * Creates the first admin user in the system.
   * Refused once any admin exists, so it only works on a fresh install.
   * @param dto The email and password for the admin user.
   * @returns A default message response dto.
   */
  public async createFirstAdmin(
    dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email, password } = dto;

    // The admin check and the promotion run under one lock shared by every
    // API instance: checked outside it, concurrent requests all see zero
    // admins and each promote their own account.
    const created = await this.redisLockService.withLock(
      FIRST_ADMIN_LOCK_KEY,
      FIRST_ADMIN_LOCK_TTL,
      () => this.bootstrapAdmin(email, password),
    );

    if (created === null) {
      throw new ConflictException('Admin initialization already in progress');
    }

    await this.authService.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    return {
      message: 'Admin user created successfully',
    };
  }

  /**
   * Signs up and promotes the first admin. Must run under the init lock.
   * @throws ForbiddenException if an admin already exists.
   */
  private async bootstrapAdmin(email: string, password: string): Promise<true> {
    if (await this.usersRepository.exists({ where: { role: Role.ADMIN } })) {
      throw new ForbiddenException();
    }

    const result = await this.authService.api.signUpEmail({
      body: {
        name: 'Admin',
        email,
        password,
      },
    });

    try {
      await this.usersRepository.update(result.user.id, {
        role: Role.ADMIN,
        emailVerified: true,
      });
    } catch (error) {
      // Drop the half-created account so a retry with the same email can sign
      // up again. It is moments old and owns nothing, so the delete cascades
      // only to its own account/session rows.
      await this.usersRepository.delete(result.user.id);
      throw error;
    }

    return true;
  }
}
